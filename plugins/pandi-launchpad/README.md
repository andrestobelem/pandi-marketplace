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
`blink-all`, `rainbow-sweep`, `scroll-text`, `icon`, `ask`, `ask-multi`, `confirm`,
`wait-for-press`, más `notify <kind>` y `notify-text <mensaje> [kind]` (usados por los
hooks), y `safety-gate` (usado por el hook `PreToolUse`, no se invoca a mano).

## Notificaciones automáticas (hooks)

`Stop` → texto "Listo" scrolleando en verde, `Notification` → "Atencion" scrolleando
en rojo. Cada hook llama a `node cli.ts notify-text <mensaje> <kind> || true`, así que
un Launchpad desconectado nunca bloquea el evento real.

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
de opciones de `ask`/`confirm` (`src/ask.ts`) y el matcher de comandos riesgosos
(`src/risky-command.ts`) son módulos puros separados, todos con tests unitarios
(vitest) en `tests/`. Se verificó en vivo contra un Launchpad X real: pad individual,
las animaciones/patterns, texto scrolleando, `ask`/`confirm`, `wait-for-press`, y los
dos hooks de notificación.

`safety-gate`/`PreToolUse` **no** se pudo verificar en vivo de forma confiable: el
Launchpad X usado para probar devolvió un press espontáneo del mismo pad ("permitir")
en dos corridas separadas de `confirm` sin que nadie lo tocara, algo a investigar en
el hardware/cableado antes de confiar en esta feature con un dispositivo real
conectado.

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
