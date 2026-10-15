# Legal IA · Mockup estático

Mockup navegable de una plataforma de orientación jurídica con IA. Tiene dos caras:

- **Portal del ciudadano.** Consultas en lenguaje natural, respuestas apoyadas en resoluciones judiciales, historial y mensajes con el despacho.
- **Backoffice del despacho**, al estilo de Oracle APEX:
  - Bandeja de consultas, casos y expedientes, clientes, análisis emocional, insight y supervisión de la IA.
  - Dashboard económico y Gestión del modelo de suscripción: planes, periodos, campañas, límites, suscriptores, impagos y permisos.

No hay servidor. `static/js/mock.js` intercepta las llamadas a la API y responde con `datos/demo.json`. Todos los nombres, personas, resoluciones y cifras son **ficticios**; las «resoluciones» del ejemplo no son jurisprudencia real.

## Acceso

No hay credenciales. En la pantalla de entrada se elige **Soy cliente** o **Soy abogado** y se pulsa **Iniciar sesión**.

| Perfil | Entra como |
|---|---|
| Soy cliente | Cliente de demostración |
| Soy abogado | Abogado (administrador) de demostración |

## Qué funciona y qué no

- **Portal.** Puedes crear consultas: tras unos segundos llega una respuesta de ejemplo según el tema (despido, fianza, pensión de alimentos o desalojo). También puedes renombrar, fijar y borrar consultas, y escribir al despacho.
- **Simuladores del backoffice.** El margen de los planes y de las campañas se calcula de verdad en el navegador.
- **Lo que no se guarda.** Los cambios de configuración y gestión del backoffice, y la subida de documentos, muestran un aviso. Todo vuelve a su estado inicial al recargar la página.

## Publicar en GitHub Pages

1. Sube el contenido de esta carpeta a la raíz de un repositorio (o a `docs/`).
2. Ve a *Settings → Pages → Deploy from a branch* y elige la rama y la carpeta.
3. Abre `https://<usuario>.github.io/<repositorio>/`.

Para probarlo en local hace falta un servidor HTTP, porque desde `file://` no se puede cargar el JSON:

```
python -m http.server 8080
```
