# pandi-marketplace

Marketplace propio de plugins para Claude Code (`/plugin marketplace add`), donde voy
agregando mis extensiones.

## Uso

```
/plugin marketplace add /Users/andrestobelem/ws/at/pandi-marketplace
/plugin install pandi-launchpad@pandi-marketplace
```

(O apuntando a la URL del repo una vez publicado en GitHub, en vez del path local.)

## Plugins

- [`pandi-launchpad-ts`](plugins/pandi-launchpad-ts) — usa un Novation Launchpad X como
  canal de luces + botones para que Claude te notifique y te pregunte cosas. TypeScript,
  sin MCP: un skill que invoca una CLI de Node.
- [`pandi-launchpad`](plugins/pandi-launchpad) — versión original en Python (MCP
  server). Quedó deshabilitada tras compararla con la de arriba, pero no se borró.

## Estructura

```
.claude-plugin/marketplace.json   # manifiesto del marketplace
plugins/<nombre>/                 # un directorio por plugin
  .claude-plugin/plugin.json      # manifiesto del plugin
```

Cada plugin nuevo se agrega como una entrada más en `plugins` dentro de
`.claude-plugin/marketplace.json`.
