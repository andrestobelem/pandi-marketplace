---
name: pandi-launchpad
description: Use a physical Novation Launchpad X as a lights + buttons channel to notify the user or ask them a yes/no-style question, by running a Node CLI (no MCP server involved). Invoke when you want to light pads to signal progress/completion, or need the user to answer by pressing a physical pad instead of typing.
allowed-tools: Bash
---

Todos los comandos se corren con:

```
node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" <comando> [args...]
```

Cada comando imprime una línea JSON a stdout con el resultado. `col`/`row` van de 1 a
8, con `(1,1)` el pad de abajo a la izquierda. Colores disponibles: `off, red, green,
blue, yellow, white, orange, purple, cyan, pink, lime, teal, gold, indigo, brown, gray,
dark_red, dark_green, dark_blue, magenta`, o (solo con `mode=static`) un hex
`"#rrggbb"`.

## Comandos que no bloquean

- `set <col> <row> <color> [mode]` — prende un pad. `mode`: `static` (color exacto,
  también acepta hex), `flash` o `pulse` (solo colores con nombre).
- `show '<jsonCells>'` — prende varios pads de una vez. `jsonCells` es un array de
  `{"col":1-8,"row":1-8,"color":str,"mode"?:"static"|"flash"|"pulse"}`.
- `clear` — apaga todo el grid.
- `pulse-all [color]` — pulsa todo el grid (indicador tipo "pensando").
- `progress-bar <percent> [color]` — llena el grid proporcionalmente a `percent` (0-100).
- `sweep [color] [cycles]` — anima una columna barriendo el grid. Bloquea mientras dura.
- `blink-all [color] [times]` — parpadea todo el grid on/off. Bloquea mientras dura.
- `rainbow-sweep [cycles]` — anima una paleta arcoíris rotando. Bloquea mientras dura.
- `scroll-text <texto> [color] [speedMs]` — hace scrollear `<texto>` de derecha a
  izquierda en fuente 5x7 (soporta A-Z, 0-9, espacio, `. ! ?`, tildes `á é í ó ú` y
  `ñ`; no distingue mayúsculas/minúsculas). Bloquea mientras dura (`speedMs` por
  columna, default 120).
- `notify-text <mensaje> [kind=done]` — como `scroll-text`, pero el color sale de
  `kind` (`done`=verde, `attention`=rojo, cualquier otro=blanco), igual que `notify`.
  Es lo que usan los hooks `Stop`/`Notification` para mostrar un mensaje en vez de
  solo prender el grid.

## Comandos que bloquean esperando un press físico

- `ask <timeoutSeconds> '<jsonOptions>'` — prende cada opción como un bloque de pads
  (2x2 por defecto, `colSpan`/`rowSpan` opcionales) y **bloquea** hasta que se aprieta
  un pad de alguna opción, o vence el timeout. `jsonOptions` es un array de
  `{"label":str,"col":1-8,"row":1-8,"color":str,"colSpan"?:n,"rowSpan"?:n}`. Devuelve
  `{"label":str}` o `{"label":null,"timed_out":true}`. Mientras espera, la fila 8 se
  usa como barra de cuenta regresiva (se va vaciando de derecha a izquierda); es
  blanca y pasa a roja en los últimos 3 segundos.
- `wait-for-press <timeoutSeconds> ['<jsonPads>']` — bloquea hasta que se aprieta
  cualquier pad (o uno de `jsonPads`, un array de `{"col","row"}`). Devuelve
  `{"col":n,"row":n}` o `{"timed_out":true}`.
- `confirm [yesLabel="si"] [noLabel="no"] [timeoutSeconds=30]` — atajo para preguntas
  sí/no: siempre verde (bloque abajo-izquierda) para `yesLabel` y rojo (bloque
  abajo-derecha) para `noLabel`, sin tener que armar el JSON de `ask` a mano. Mismo
  formato de respuesta que `ask`.

**Importante:** como el dispositivo no tiene pantalla, decí el prompt/opciones en tu
propia respuesta de texto (antes de correr el comando) para que la persona sepa qué
pad apretar y cuándo — el comando en sí no muestra nada. Decile explícitamente que
tiene N segundos para apretar.

## Requisitos

Un Launchpad X conectado por USB antes de invocar cualquier comando. Si no detecta el
puerto automáticamente, fijá el nombre exacto en `LAUNCHPAD_OUTPUT_PORT` /
`LAUNCHPAD_INPUT_PORT` (env vars). Necesita `node_modules` instalado una vez
(`npm install` en la carpeta del plugin).
