# pandi-launchpad

MCP server que convierte un **Novation Launchpad X** (conectado por USB) en un canal
de comunicación bidireccional entre Claude y vos: Claude prende pads con colores para
avisarte cosas o para preguntarte algo, y vos respondés apretando los pads.

## Qué expone

Tools MCP (Claude las llama cuando lo necesita, no hace falta que se lo pidas):

- `lp_set(col, row, color, mode="static")` — prende un pad. `col`/`row` van de 1 a 8
  (`(1,1)` es el pad de abajo a la izquierda). `mode`: `static` (color exacto),
  `flash` o `pulse` (color aproximado, ver más abajo).
- `lp_show(cells)` — prende varios pads de una sola vez.
- `lp_clear()` — apaga todo el grid.
- `lp_ask(prompt, options, timeout=60)` — prende pads etiquetados como opciones y
  **bloquea** hasta que apretás uno (o vence el timeout). Así es como Claude te hace
  una pregunta y espera tu respuesta apretando un botón físico.
- `lp_wait_for_press(pads=None, timeout=60)` — espera a que apretés cualquier pad (o
  uno de un subconjunto), sin asociarlo a ninguna opción.

Colores disponibles: `off, red, green, blue, yellow, white, orange, purple, cyan, pink`.

## Requisitos

- Un Launchpad X conectado por USB **antes** de que arranque este MCP server (si lo
  conectás después, reiniciá la sesión de Claude Code para que vuelva a detectar el
  puerto).
- `uv` instalado (Claude Code lo invoca vía `uvx --from ... pandi-launchpad`).
- Herramientas de compilación de C (Xcode Command Line Tools en macOS) porque
  `python-rtmidi` compila una extensión nativa.

## Detección de puerto

El Launchpad X expone dos pares de puertos MIDI (uno para DAWs, otro genérico). Este
plugin busca automáticamente uno cuyo nombre contenga "launchpad" y no "daw". Si tu
sistema nombra los puertos distinto y la autodetección falla, fijá el nombre exacto
(lo podés ver con `python -c "import mido; print(mido.get_input_names())"`) en las
variables de entorno `LAUNCHPAD_OUTPUT_PORT` / `LAUNCHPAD_INPUT_PORT`.

## Sobre los colores

El modo `static` usa el comando SysEx de color RGB exacto del Launchpad X, así que el
color que pedís es el que se ve. Los modos `flash`/`pulse` solo aceptan un índice de la
paleta interna del dispositivo (no RGB libre); los índices que usamos para
red/green/blue salen literalmente de los ejemplos del manual, el resto son una
aproximación visual a partir de la tabla de paleta — si un color no te convence,
ajustá `COLORS` en `src/pandi_launchpad/device.py`.

## Nota de implementación

No se pudo probar contra el hardware real al construir este plugin (sin acceso físico
al dispositivo en el entorno de desarrollo): la lógica de protocolo está tomada del
*Launchpad X Programmer's Reference Manual* oficial de Novation/Focusrite, y la lógica
pura (mapeo de pads, mensajes SysEx) tiene tests unitarios en `tests/`, pero conviene
verificar con el dispositivo real la primera vez — sobre todo la detección de puerto y
los colores aproximados de `flash`/`pulse`.

## Desarrollo

```bash
cd plugins/pandi-launchpad
uv run --with pytest --with mido pytest   # corre los tests sin hardware
```
