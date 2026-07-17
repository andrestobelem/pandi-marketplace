# pandi-launchpad

Convierte un **Novation Launchpad X** en un canal bidireccional entre Claude y vos:
un **skill** (`skills/pandi-launchpad/SKILL.md`) que le dice a Claude cómo invocar una
CLI de Node para prender pads, animar patterns, hacer scrollear texto, y preguntar
bloqueando hasta que apretás un pad. Sin MCP server — todo vía Bash + una CLI.

## Requisitos

- Node >= 22 (usa TypeScript nativo de Node, sin paso de build ni `tsx`/`ts-node`).
- `npm install` una vez en esta carpeta.
- Un Launchpad X conectado por USB antes de correr cualquier comando.

## CLI

Todos los comandos: `node src/cli.ts <comando> [args...]` (o con
`${CLAUDE_PLUGIN_ROOT}` en vez de `src` cuando lo invoca el skill). Ver
`skills/pandi-launchpad/SKILL.md` para la lista completa de comandos y su formato
JSON de entrada/salida: `set`, `show`, `clear`, `pulse-all`, `progress-bar`, `sweep`,
`blink-all`, `rainbow-sweep`, `scroll-text`, `icon`, `focus-timer`, `ask`, `ask-multi`,
`confirm`, `wait-for-press`, más `notify <kind>` y `notify-text <mensaje> [kind]`
(usados por los hooks `Stop`/`Notification`), y `safety-gate`/`pulse-all`/`clear`
(usados por los hooks `PreToolUse`/`PreCompact`/`PostCompact`, no se invocan a mano).

## `menu`: arrancar o seguir una conversación sin teclear

A diferencia de todo lo anterior (que corre Claude vía el skill), `menu` es para
que lo corras vos mismo, standalone, en una terminal aparte:

```bash
npm run menu
# o: node src/cli.ts menu ['<jsonItems>'] ['<jsonExitItem>']
```

Prende un set de frases predefinidas (`src/menu.ts`, `DEFAULT_MENU_ITEMS`) como
bloques 2x2 y queda en loop: cada pad que apretás copia su frase al portapapeles
(`pbcopy`, así que es **solo macOS**) y el menú se vuelve a mostrar para el
próximo pick — pegás con Cmd+V (y Enter) en la terminal donde tenés (o vas a
abrir) la sesión de Claude Code, sin escribir nada. Sirve igual para arrancar
una conversación nueva que para contestar/seguir una que ya está corriendo.
El bloque gris `flash` arriba a la derecha (`DEFAULT_EXIT_ITEM`) cierra el loop;
Ctrl+C también apaga el grid antes de salir. `jsonItems`/`jsonExitItem` opcionales
reemplazan el set de frases/la posición del botón de salir por los tuyos
(mismo formato que `ask`'s `jsonOptions`, más un campo `text` con la frase que se
copia).

## Notificaciones automáticas (hooks)

`Stop` → texto "Listo" scrolleando en verde, `Notification` → "Atencion" scrolleando
en rojo. Cada hook llama a `node cli.ts notify-text <mensaje> <kind> || true`, así que
un Launchpad desconectado nunca bloquea el evento real.

`PreCompact`/`PostCompact` → `pulse-all blue` / `clear`, como señal ambiente de "hay
una compactación de contexto en curso" mientras dura (no hay hook de progreso
continuo en Claude Code — `PreCompact`/`PostCompact` solo marcan el antes/después, ver
issue de origen). El pulso lo anima el propio hardware del Launchpad en modo `pulse`
una vez prendido, así que sigue "vivo" aunque el proceso de la CLI ya haya terminado;
`PostCompact` simplemente lo apaga.

`SubagentStop` → `pulse-all purple`, distinto del verde de `Stop`, para señalar "un
subagente terminó" sin confundirlo con el fin de la sesión principal. No se apaga
explícitamente (queda pulsando hasta el próximo evento que reescriba el grid); si se
corren varios subagentes seguidos el pulso simplemente se refresca en el mismo color.

`PreToolUse` (matcher `Bash`) → `node cli.ts safety-gate`, que lee el payload del hook
por stdin y decide vía `src/risky-command.ts` si el comando es riesgoso (force-push,
`reset --hard`, `rm -rf`, etc.). Si no lo es, o no hay Launchpad conectado, devuelve
`permissionDecision: "ask"` sin abrir el dispositivo (no agrega latencia a los demás
comandos de Bash). Si lo es, bloquea con `confirm` hasta que se aprieta un pad —
sin respuesta a tiempo cuenta como bloqueo, a diferencia de los hooks de notificación
que nunca bloquean el evento real.

## Detección de puerto

Busca automáticamente un puerto MIDI cuyo nombre contenga "launchpad" y no "daw". Si
falla, fijá el nombre exacto (`node -e "console.log(new (require('@julusian/midi').Input)().getPortCount())"`
o similar) en `LAUNCHPAD_OUTPUT_PORT` / `LAUNCHPAD_INPUT_PORT`.

## Nota de implementación

El protocolo (mapeo de pads, colores, mensajes SysEx) vive en `src/protocol.ts`; la
fuente de texto (`src/font.ts`, 5x7), los íconos fijos 8x8 (`src/icons.ts`), la lógica
de opciones de `ask`/`confirm` (`src/ask.ts`), el layout de `menu` (`src/menu.ts`) y
el matcher de comandos riesgosos (`src/risky-command.ts`) son módulos puros separados,
todos con tests unitarios (vitest) en `tests/`. Se verificó en vivo contra un
Launchpad X real: pad individual, las animaciones/patterns, texto scrolleando,
`ask`/`confirm`, `wait-for-press`, `menu` (los 6 bloques de color, el bloque gris
de salida parpadeando, el check de feedback por color tras cada press, y el copiado
a `pbcopy`), y los dos hooks de notificación.

`safety-gate`/`PreToolUse` **no** se pudo verificar en vivo de forma totalmente
confiable: el Launchpad X usado para probar resolvió `confirm` solo, sin que nadie lo
tocara, en un puñado de corridas repartidas en dos sesiones de prueba distintas.
Datos reunidos hasta ahora:

- No es un pad específico trabado: las resoluciones espontáneas dieron labels
  distintos entre sí ("si" y "no" en corridas diferentes), no siempre el mismo pad.
- Parece correlacionado con la *primera* invocación después de que el dispositivo
  estuvo un rato sin uso: en la sesión de prueba más reciente, las primeras 2
  corridas de `confirm` de la sesión resolvieron solas, pero las 25 corridas
  siguientes, una atrás de la otra sin pausas, dieron timeout limpio sin excepción.
- Un raw-listen en el puerto de entrada (sin dibujar nada) y una reproducción
  sintética del loop de dibujo de `confirm` (mismo patrón de SysEx que `runAsk`, 6
  corridas) no lograron capturar el evento — el único mensaje visto fue el propio
  eco del SysEx de programmer-mode, que no puede confundirse con un note-on (los
  mensajes SysEx arrancan con `0xF0`, y `0xF0 & 0xF0 !== 0x90`).

Hipótesis más plausible con estos datos: algo del lado del driver/SO (buffering de
eventos MIDI encolados de un uso anterior, o un burst de "asentamiento" del propio
dispositivo al reabrir el puerto tras estar idle) se entrega en la primera apertura
de puerto tras un período sin uso — no necesariamente un pad físicamente roto. Sigue
sin confirmarse; no confiar ciegamente en esta feature con un dispositivo real
conectado hasta verificarlo más, en particular repitiendo la prueba después de
dejar el dispositivo idle un rato (no en corridas consecutivas).

Nota de diseño: la CLI abre y cierra una conexión MIDI nueva en cada invocación (no
mantiene un proceso persistente) — por eso `close()` en `src/device.ts` **no** apaga
el "programmer mode" del dispositivo, o cada comando se autodeshacía apenas terminaba
el proceso.

## Desarrollo

```bash
cd plugins/pandi-launchpad
npm install
npm test        # vitest, sin hardware
npm run typecheck
```
