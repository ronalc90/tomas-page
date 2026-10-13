# Guía para escribir el contenido del plan

Este documento define **cómo se escribe cada semana** del plan de Tomás Sandí. El temario completo está en
`content/temario.md`; las fases, en `content/fases.json`. Cada semana va en su propio archivo
`content/semanas/sNN.json` y se valida con:

```bash
python3 scripts/plan.py validar sNN     # valida la semana, ejecuta todo el SQL y el Python, muestra los resultados esperados
```

La semana está lista solo cuando el validador termina con **0 errores**. Los avisos se revisan uno por uno.

## El estudiante y el tono

- Tomás Sandí, Costa Rica. Está aprendiendo desde cero; el eje del curso es **SQL**, después Python.
- Español claro y neutro con contexto costarricense (colones `₡`, provincias, SINPE Móvil, feriados de Costa Rica). Se le habla de **tú**.
- Profesional, cálido y concreto. Nada de relleno ni frases motivacionales vacías. Cada párrafo enseña algo.
- Explica el **porqué** además del cómo. Anticipa los errores típicos de un principiante.
- Nada de emojis.
- Formato dentro de los textos: `código` entre comillas invertidas, **negrita** con doble asterisco para la idea clave
  (con moderación), y párrafos separados con una línea en blanco (`\n\n`) en `concept`. No hay más markdown
  (ni listas, ni títulos, ni enlaces) dentro de los textos.

## La base de práctica: «Tienda Pura Vida»

Todo el SQL de las fases 1 y 2 usa la base SQLite `packages/shared/src/data/tienda.sql` (generada por
`scripts/generar_tienda.py`). Tomás la tiene cargada en el **laboratorio SQL** de la página: un editor que corre
las consultas en el navegador. Léela antes de escribir (`python3` + `sqlite3` en memoria) y verifica cada número
que menciones en un texto ejecutando la consulta.

Tablas: `provincias(id, nombre)`, `clientes(id, nombre, apellido, email, telefono, provincia_id, fecha_nacimiento, fecha_registro)`,
`categorias(id, nombre, descripcion)`, `productos(id, nombre, categoria_id, precio, costo, stock, activo, fecha_lanzamiento)`,
`empleados(id, nombre, apellido, puesto, departamento, salario, fecha_ingreso, jefe_id)`,
`pedidos(id, cliente_id, empleado_id, fecha, estado, metodo_pago, costo_envio)`,
`detalle_pedido(id, pedido_id, producto_id, cantidad, precio_unitario, descuento)`,
`resenas(id, producto_id, cliente_id, calificacion, comentario, fecha)`.

Datos útiles: precios en colones enteros; fechas como texto `'AAAA-MM-DD'`; pedidos de 2025-01-02 a 2026-09-30;
`descuento` es una fracción (0.1 = 10 %); el total de una línea es `cantidad * precio_unitario * (1 - descuento)`;
`empleado_id` NULL = compra en línea; hay clientes sin email, teléfono o fecha de nacimiento (NULL), clientes que
nunca compraron, productos que nunca se vendieron, una categoría sin productos («Libros»), empleados con jefe
(`jefe_id`) y la gerente sin jefe.

**«Hoy» en el mundo de los datos es `'2026-09-30'`.** Nunca uses `date('now')`, `CURRENT_DATE`, `random()` ni
nada que cambie con el día: los resultados deben ser siempre los mismos.

## Estructura de un archivo de semana

```jsonc
{
  "id": "s01",                 // s01 … s12
  "number": 1,
  "phaseId": 1,                // 1 a 4, ver fases.json
  "title": "Tus primeras consultas",
  "rangeLabel": "13 oct – 17 oct",
  "days": [ /* un objeto por cada día de lunes a viernes de la semana (también feriados) */ ],
  "deliverable": { /* el entregable del sábado (o del 30 dic en s12) */ }
}
```

### Un día de taller

```jsonc
{
  "date": "2026-10-13",
  "kind": "workshop",
  "title": "Bases de datos y SELECT",            // corto, como en el temario
  "summary": "Una frase de 1–2 líneas con lo que se logra hoy.",
  "objectives": ["3 a 5 objetivos concretos y verificables, empezando por un verbo"],
  "schedule": [                                   // suma 220–250 minutos
    {"label": "Tema 1: …", "minutes": 70},
    {"label": "Tema 2: …", "minutes": 70},
    {"label": "Práctica: ejercicios en el laboratorio", "minutes": 70},
    {"label": "Reto y evaluación", "minutes": 30}
  ],
  "topics": [ TEMA, TEMA ],                       // exactamente 2
  "exercises": [ EJERCICIO … ],                    // días de SQL: 6. Días de Python: 2 de «Repaso SQL». Días de proyecto: 0–3
  "tasks": ["…"],                                  // días de SQL: [] (la práctica son los ejercicios). Días de Python: 4–5
  "taskHints": ["…"],                              // una pista por tarea, mismo orden
  "challenge": { "title": "", "description": "", "hint": "", "solution": "", "language": "sql" },
  "glossary": [ {"term": "", "definition": ""} ], // 4 a 7 términos del día; aparecen como tooltip en el texto
  "resources": [ {"title": "", "url": "https://…"} ],  // 2 a 4 enlaces reales y estables
  "questions": [ PREGUNTA × 8 ]
}
```

Un feriado o día libre es solo: `{"date": "2026-12-01", "kind": "holiday", "title": "Día de la Abolición del Ejército", "summary": "Feriado nacional: hoy no hay taller."}`
(`kind: "free"` para el 24 de diciembre).

### TEMA

```jsonc
{
  "title": "SELECT y FROM",
  "concept": "2 a 4 párrafos (400–1200 caracteres) separados por \n\n. Qué es, para qué sirve, cómo se escribe, la idea clave en **negrita**.",
  "tip": "Un consejo práctico de 1–2 frases que un buen profesor daría.",
  "example": "SELECT nombre, precio\nFROM productos\nLIMIT 5;",
  "language": "sql",          // sql | python | bash
  "exampleOutput": "",        // SQL: déjalo vacío, el validador lo llena con la tabla real. Python: la salida EXACTA (se verifica)
  "steps": [                  // 3 a 6 pasos de una guía práctica: Tomás los va probando en el laboratorio
    {"title": "…", "body": "Explicación de 1–3 frases de qué hacer y qué observar (mínimo 60 caracteres).", "code": "SELECT …;", "language": "sql"}
  ],
  "commonErrors": [           // 2 a 4
    {"error": "Mensaje real de SQLite o síntoma", "cause": "Por qué pasa.", "fix": "Cómo se arregla."}
  ]
}
```

- Todo el código SQL (ejemplo, pasos, reto) **se ejecuta** contra la base Tienda en el validador: debe ser SQL
  completo y válido para SQLite. Un bloque puede tener varias sentencias separadas por `;`.
  Si un paso muestra a propósito código que falla (para enseñar un error), agrega `"noRun": true` al paso.
- El ejemplo SQL de un tema debe terminar en un `SELECT` (es lo que se muestra como resultado).
- Los ejemplos de Python deben correr con `python3` sin `input()`, y `exampleOutput` debe coincidir exactamente
  con lo que imprimen. Al ejecutarlos, la carpeta de trabajo tiene `tienda.db` (la misma base que Tomás descarga
  del laboratorio), así que `sqlite3.connect("tienda.db")` funciona. Hay pandas y matplotlib (sin pantalla:
  guarda la gráfica con `savefig`, no uses `show()` en código que se ejecuta). Otros archivos no existen: créalos
  dentro del mismo ejemplo si los necesitas. Si un ejemplo necesita `input()`, escribe en `exampleOutput` una
  sesión de ejemplo (no se ejecuta). Si un paso depende de archivos (p. ej. `tienda.db`), marca `"noRun": true`.

### EJERCICIO (SQL que se califica solo)

```jsonc
{
  "id": "2026-10-13-1",          // fecha-número en los días; sNN-número en los entregables. Único en todo el plan
  "title": "Catálogo básico",
  "prompt": "Muestra el `nombre` y el `precio` de todos los productos.",
  "hint": "Una pista que oriente sin regalar la respuesta.",
  "solution": "SELECT nombre, precio FROM productos;",
  "check": "",                   // solo para ejercicios que modifican datos: un SELECT que muestre el efecto
  "setup": "",                   // SQL opcional que se corre antes (p. ej. crear una tabla de trabajo)
  "starter": "",                 // código inicial opcional en el editor (p. ej. "SELECT\nFROM productos;")
  "orderMatters": false
}
```

Cómo se califica (es importante para escribir bien el enunciado):

1. Se toma una copia limpia de la base, se corre `setup`, luego el SQL de Tomás. Si hay `check`, se corre `check`
   y se compara su resultado; si no, se compara el resultado de la última sentencia que devuelve filas.
2. Lo mismo con `solution`. Se comparan **los valores**, no los nombres de las columnas (los alias son libres).
3. Debe coincidir el **número de columnas y su orden**. Por eso el enunciado dice exactamente qué columnas y en qué
   orden ("Muestra el nombre y el precio, en ese orden").
4. Los decimales se comparan redondeados a 2 cifras. Si la solución redondea a 0 o 1 decimales, el enunciado lo dice.
5. Si `orderMatters` es `false`, el orden de las filas no importa. Si es `true`, el enunciado debe pedir el orden
   explícitamente **con su desempate** (el validador falla si el orden tiene empates): "ordenados de mayor a menor
   precio y, si empatan, por nombre".
6. El resultado debe ser determinista y tener entre 1 y ~60 filas (máximo 150). Nada de `LIMIT` con empates en el corte.

Progresión: en un día de SQL hay 6 ejercicios: 2 fáciles (aplican el tema 1), 2 medios (tema 2), y 2 que combinan
los dos temas con lo de días anteriores (repaso en espiral). Títulos cortos y con sentido de negocio
("Clientes de Heredia", "Productos para reponer"). Los enunciados cuentan una situación real de la tienda
("La gerente quiere saber…") y piden algo concreto.

### PREGUNTA (evaluación de 8)

```jsonc
{
  "type": "choice",              // choice (4 opciones) | boolean (["Verdadero", "Falso"]) | output | fill
  "prompt": "…",
  "code": "",                    // código que acompaña la pregunta; obligatorio en output y fill
  "options": ["…", "…", "…", "…"],
  "correctIndex": 2,
  "accepted": [],                // output/fill: respuestas aceptadas, la primera es la canónica
  "optionFeedback": ["un comentario por opción: por qué está bien o mal"],
  "explanation": "Por qué la respuesta correcta es correcta.",
  "hint": "Pista que se puede destapar; no revela la respuesta."
}
```

- Mezcla: 3 `choice`, 2 `boolean`, 2 `output`, 1 `fill` (aproximadamente). Varía la posición de la respuesta correcta.
- `output` con SQL: «¿Qué devuelve esta consulta?» sobre la base Tienda; el validador ejecuta la consulta y si
  devuelve un solo valor comprueba que `accepted[0]` coincida. Prefiere consultas que devuelvan un solo valor.
- `fill`: el hueco se marca con `___` en `code`; la respuesta se compara sin espacios ni mayúsculas.
- Distractores plausibles: los errores reales que cometería un principiante.

### Entregable

```jsonc
{
  "dueDate": "2026-10-17",
  "kind": "weekly",              // weekly | mini-project | final
  "path": "Laboratorio SQL",     // dónde se trabaja: "Laboratorio SQL" o la carpeta/archivo en su computador
  "description": "Qué se entrega y para qué, en 1–3 frases.",
  "criteria": ["3 a 6 criterios verificables que revisa el administrador"],
  "steps": ["3 a 8 pasos para abordarlo"],
  "tips": ["2 a 4 consejos"],
  "stretch": "Un reto opcional para ir más allá.",
  "checklist": ["3 a 8 cosas a revisar antes de enviar"],
  "exercises": [ EJERCICIO … ]   // semanas de SQL: 8 a 10 preguntas de negocio que se califican solas (ids sNN-1…)
}
```

En las semanas de SQL el entregable es un **informe**: 8–10 ejercicios calificados automáticamente que integran
toda la semana, más una conclusión escrita (la evidencia) que Tomás redacta con lo que descubrió en los datos.
En las semanas de Python el entregable es un programa en su computador; en `exercises` pueden ir 2–3 consultas de repaso.

## Calidad

- Antes de dar la semana por terminada: valida, lee tus textos de nuevo como si fueras Tomás, y comprueba que cada
  número que aparece en un texto (concept, steps, explanation…) es el que devuelve la base.
- Los enlaces de `resources` deben existir. Preferencia: documentación oficial de SQLite (sqlite.org/lang_*.html),
  documentación de Python en español (docs.python.org/es/3/…), y sitios estables y reconocidos. Verifícalos.
- Nada debe depender de un día anterior que no esté en el temario. Puedes y debes repasar lo de días anteriores.
- Calidad de referencia: el plan anterior (`git show fc21ac3:packages/shared/src/data/plan.json`) tenía el nivel
  de detalle esperado en conceptos, pasos, errores y preguntas; úsalo como referencia de tono y profundidad
  (pero usaba otra base de datos y otro orden de temas).
