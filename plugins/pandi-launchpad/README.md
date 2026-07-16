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
`blink-all`, `rainbow-sweep`, `scroll-text`, `ask`, `confirm`, `wait-for-press`, más
`notify <kind>` (usado por los hooks).

## Notificaciones automáticas (hooks)

`Stop` → grid verde fijo, `Notification` → grid rojo pulsante. Cada hook llama a
`node cli.ts notify <kind> || true`, así que un Launchpad desconectado nunca bloquea
el evento real.

## Detección de puerto

Busca automáticamente un puerto MIDI cuyo nombre contenga "launchpad" y no "daw". Si
falla, fijá el nombre exacto (`node -e "console.log(new (require('@julusian/midi').Input)().getPortCount())"`
o similar) en `LAUNCHPAD_OUTPUT_PORT` / `LAUNCHPAD_INPUT_PORT`.

## Nota de implementación

El protocolo (mapeo de pads, colores, mensajes SysEx) vive en `src/protocol.ts`; la
fuente de texto (`src/font.ts`, 5x7) y la lógica de opciones de `ask`/`confirm`
(`src/ask.ts`) son módulos puros separados, todos con tests unitarios (vitest) en
`tests/`. Se verificó en vivo contra un Launchpad X real: pad individual, las
animaciones/patterns, texto scrolleando, `ask`/`confirm`, `wait-for-press`, y los dos
hooks.

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
