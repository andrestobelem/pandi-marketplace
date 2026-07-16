# pandi-launchpad-ts

Misma idea que [`pandi-launchpad`](../pandi-launchpad): convierte un **Novation
Launchpad X** en un canal bidireccional entre Claude y vos. Esta versión reimplementa
el mismo protocolo en **TypeScript**, sin MCP server — expone un **skill**
(`skills/pandi-launchpad-ts/SKILL.md`) que le dice a Claude cómo invocar una CLI de
Node para prender pads, animar patterns, y preguntar bloqueando hasta que apretás un
pad.

## Por qué existe (comparado con pandi-launchpad)

El MCP server en Python solo refresca su lista de tools al arrancar la sesión de
Claude Code — `/reload-plugins` no alcanza, hace falta reiniciar la sesión entera cada
vez que se agrega una tool nueva. Un skill, en cambio, es descubierto por el listado de
skills disponibles y no tiene ese problema. La comparación ya se resolvió: esta versión
tiene paridad completa con la de Python más funcionalidad que esa nunca tuvo (texto
scrolleando, atajo `confirm`), y es la que se usa día a día. `pandi-launchpad` (Python)
queda deshabilitado pero no se borró.

## Requisitos

- Node >= 22 (usa TypeScript nativo de Node, sin paso de build ni `tsx`/`ts-node`).
- `npm install` una vez en esta carpeta (a diferencia de `uvx`, no se resuelve solo al
  instalar el plugin).
- Un Launchpad X conectado por USB antes de correr cualquier comando.

## CLI

Todos los comandos: `node src/cli.ts <comando> [args...]` (o con
`${CLAUDE_PLUGIN_ROOT}` en vez de `src` cuando lo invoca el skill). Ver
`skills/pandi-launchpad-ts/SKILL.md` para la lista completa de comandos y su formato
JSON de entrada/salida — están los mismos que en `pandi-launchpad`: `set`, `show`,
`clear`, `pulse-all`, `progress-bar`, `sweep`, `blink-all`, `rainbow-sweep`, `ask`,
`wait-for-press`, más `notify <kind>` (usado por los hooks); y dos que no tiene la
versión Python: `scroll-text <texto> [color] [speedMs]` (texto en fuente 5x7) y
`confirm [yesLabel] [noLabel] [timeoutSeconds]` (atajo de `ask` para sí/no).

## Notificaciones automáticas (hooks)

Igual que `pandi-launchpad`: `Stop` → grid verde fijo, `Notification` → grid rojo
pulsante. Cada hook llama a `node cli.ts notify <kind> || true`, así que un Launchpad
desconectado nunca bloquea el evento real.

## Detección de puerto

Busca automáticamente un puerto MIDI cuyo nombre contenga "launchpad" y no "daw". Si
falla, fijá el nombre exacto (`node -e "console.log(new (require('@julusian/midi').Input)().getPortCount())"`
o similar) en `LAUNCHPAD_OUTPUT_PORT` / `LAUNCHPAD_INPUT_PORT`.

## Nota de implementación

El protocolo (mapeo de pads, colores, mensajes SysEx) es una portación 1:1 del módulo
Python, con tests unitarios en `tests/` (vitest) que espejan `test_device.py`. La
fuente de texto (`src/font.ts`, 5x7) y la lógica de opciones de `ask`/`confirm`
(`src/ask.ts`) son piezas puras propias de esta versión, también con tests. Se
verificó en vivo contra un Launchpad X real: pad individual, las animaciones/
patterns, texto scrolleando, `ask`/`confirm`, `wait-for-press`, y los dos hooks.

Nota de diseño encontrada probando en vivo: a diferencia del server MCP (que mantiene
una conexión persistente y solo sale de "programmer mode" al cerrar la sesión), esta
CLI abre y cierra una conexión nueva en cada invocación — por eso `close()` **no**
apaga el programmer mode (ver comentario en `src/device.ts`), o cada comando se
autodeshacía apenas terminaba.

## Desarrollo

```bash
cd plugins/pandi-launchpad-ts
npm install
npm test        # vitest, sin hardware
npm run typecheck
```
