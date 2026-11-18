# Activar el catálogo y los apartados (una sola vez, 5 minutos)

La página ya trae el catálogo (`/lealtad/#catalogo`) y los apartados (en `#tienda`), pero el Apps Script
necesita un archivo nuevo para guardarlos. **No se toca `Code.gs` ni el PIN.**

1. Abre la hoja de Google Sheets de las tarjetas, con la cuenta de la tienda.
2. Menú **Extensiones > Apps Script**.
3. A la izquierda, junto a "Archivos", toca **+ > Secuencia de comandos**. Nómbralo `Catalogo`.
4. Borra lo que trae y pega todo el contenido de `Catalogo.gs`. Guarda (ícono de disquete).
5. **Implementar > Gestionar implementaciones**, toca el **lápiz**, en "Versión" elige **Nueva versión** y toca **Implementar**.
6. Google pide permiso otra vez, ahora también para **Google Drive** (ahí se guardan las fotos).
   Sale "Google no ha verificado esta app": **Configuración avanzada > Ir a… (no seguro)**. Es tu propio código.

La dirección `/exec` no cambia, así que no hay que tocar la página.

## Qué se crea solo

- Pestañas nuevas en la hoja: **Catalogo**, **Apartados** y **Abonos** (con el primer producto o apartado).
- Una carpeta en Google Drive: **Catálogo Jireh shop (fotos)**. Las fotos se ven con el enlace (así las ve la página).
  Si la dueña quita una foto o borra un producto, esa foto se va a la papelera de Drive.

## Cómo lo usa la dueña

- **Agregar productos:** abre `…/lealtad/#catalogo`, abajo toca **"Soy la dueña"** y pone el PIN de la tienda
  (o desde `#tienda`, botón **Agregar o editar productos**). Aparece **+ Agregar producto**: fotos desde la cámara
  o galería, nombre, categoría, precio, precio de oferta, tallas y descripción. Tocando una prenda se edita,
  se marca **Agotado** o se **Oculta**.
- **Apartados:** en `#tienda`, busca a la clienta y toca **+ Nuevo apartado** (prenda, precio, anticipo; sugiere el 30%
  y pone fecha límite a 3 semanas). Cada pago se registra con **Registrar abono**, y **Enviar saldo por WhatsApp**
  le manda a la clienta su total, abonado, saldo y fecha límite. La lista **Apartados pendientes** muestra cuánto
  hay por cobrar y marca en rojo los vencidos.
- La clienta ve sus apartados abiertos y su saldo en su propia tarjeta.

Para cambiar el % o los días del apartado: `APARTADO_PCT` / `APARTADO_DIAS` en `Catalogo.gs` **y** en `CONFIG` de `lealtad/index.html`.
