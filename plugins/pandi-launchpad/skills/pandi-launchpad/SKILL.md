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
- `rainbow-text <texto> [speedMs]` — como `scroll-text`, pero cada carácter usa un
  color distinto de una paleta arcoíris rotando, en vez de un único color para
  todo el texto.
- `notify-text <mensaje> [kind=done]` — como `scroll-text`, pero el color sale de
  `kind` (`done`=verde, `attention`=rojo, cualquier otro=blanco), igual que `notify`.
  Es lo que usan los hooks `Stop`/`Notification` para mostrar un mensaje en vez de
  solo prender el grid.
- `icon <nombre> [color=white] [durationMs=1500]` — prende un patrón fijo 8x8
  (`check`, `x`, `hourglass`, `arrow-up`, `arrow-down`, ver `src/icons.ts`) por
  `durationMs` y limpia el grid. Más rápido de leer que `scroll-text` para eventos
  frecuentes (éxito, error, esperando).
- `focus-timer <minutos>` — cuenta regresiva standalone reusando la countdown bar de
  `ask`/`confirm` (fila 8, blanca y roja en los últimos 3s), sin preguntar nada.
  Bloquea mientras dura.

## Comandos que bloquean esperando un press físico

- `ask <timeoutSeconds> '<jsonOptions>'` — prende cada opción como un bloque de pads
  (2x2 por defecto, `colSpan`/`rowSpan` opcionales) y **bloquea** hasta que se aprieta
  un pad de alguna opción, o vence el timeout. `jsonOptions` es un array de
  `{"label":str,"col":1-8,"row":1-8,"color":str,"colSpan"?:n,"rowSpan"?:n}`. Devuelve
  `{"label":str}` o `{"label":null,"timed_out":true}`. Mientras espera, la fila 8 se
  usa como barra de cuenta regresiva (se va vaciando de derecha a izquierda); es
  blanca y pasa a roja en los últimos 3 segundos. Si vence el timeout, el bloque de
  opciones parpadea en rojo (~400ms) antes de apagarse, para distinguir "nadie
  contestó a tiempo" de una pulsación real. Si en cambio hay una pulsación real,
  antes de apagar se muestra un ícono breve (~800ms) de confirmación: check verde
  para la opción "afirmativa" (color verde, p. ej. el "si" de `confirm`), x roja
  para la "negativa" (color rojo, p. ej. el "no"), o un check en el color propio de
  la opción para cualquier otro caso.
- `wait-for-press <timeoutSeconds> ['<jsonPads>']` — bloquea hasta que se aprieta
  cualquier pad (o uno de `jsonPads`, un array de `{"col","row"}`). Devuelve
  `{"col":n,"row":n}` o `{"timed_out":true}`.
- `confirm [yesLabel="si"] [noLabel="no"] [timeoutSeconds=30]` — atajo para preguntas
  sí/no: siempre verde (bloque abajo-izquierda) para `yesLabel` y rojo (bloque
  abajo-derecha) para `noLabel`, sin tener que armar el JSON de `ask` a mano. Mismo
  formato de respuesta que `ask`.
- `ask-multi <timeoutSeconds> '<jsonOptions>' ['<jsonDoneOption>']` — como `ask`,
  pero cada press hace toggle de esa opción (se prende en modo `pulse` cuando está
  seleccionada, `static` cuando no) en vez de resolver al toque. Hay un bloque fijo
  de "listo" (blanco, `flash`, 2x2 en col=7,row=6 por defecto — arriba a la derecha,
  fuera de la fila 8 y de las filas 1-2 típicas de las opciones) que confirma la
  selección actual; `jsonDoneOption` opcional la reposiciona:
  `{"col":1-8,"row":1-8,"color"?:str,"colSpan"?:n,"rowSpan"?:n}`. Devuelve
  `{"labels":[...]}` (o con `"timed_out":true` si vence el timeout con lo
  seleccionado hasta ese momento). Igual que `ask`, si vence el timeout todo el
  bloque (opciones + "listo") parpadea en rojo antes de apagarse; si en cambio se
  confirma con el pad de "listo", se muestra un check verde breve antes de apagar.

**Importante:** como el dispositivo no tiene pantalla, decí el prompt/opciones en tu
propia respuesta de texto (antes de correr el comando) para que la persona sepa qué
pad apretar y cuándo — el comando en sí no muestra nada. Decile explícitamente que
tiene N segundos para apretar.

## Gate de seguridad (hook `PreToolUse`)

`safety-gate` no se invoca a mano: lo corre automáticamente el hook `PreToolUse`
(`hooks/hooks.json`) antes de cada llamada a la tool `Bash`. Lee el payload del hook
por stdin; si el comando no es riesgoso (o no hay Launchpad conectado), no abre el
dispositivo y devuelve `permissionDecision: "ask"` (sigue el flujo normal de permisos).
Si el comando matchea un patrón riesgoso (`git push --force`, `git reset --hard`,
`git clean -f`, `git branch -D`, `git checkout`/`restore` que descartan cambios,
`rm -rf`, ver `src/risky-command.ts`), prende el bloque verde ("permitir") / rojo
("bloquear") de `confirm` y bloquea hasta que se aprieta un pad o vence el timeout de
30s — sin respuesta a tiempo cuenta como bloqueo (fail-closed).

## Requisitos

Un Launchpad X conectado por USB antes de invocar cualquier comando. Si no detecta el
puerto automáticamente, fijá el nombre exacto en `LAUNCHPAD_OUTPUT_PORT` /
`LAUNCHPAD_INPUT_PORT` (env vars). Necesita `node_modules` instalado una vez
(`npm install` en la carpeta del plugin).
