# Temario del Plan de Tomás Sandí · SQL y Python (13 oct – 30 dic 2026)

Estudiante: Tomás Sandí (Costa Rica). Unas 4 horas de estudio por día, de lunes a viernes.
Sábado: entregable de la semana. Feriados: 1 dic (Abolición del Ejército), 24 dic (libre), 25 dic (Navidad).
Eje principal: **SQL**. Base de práctica: «Tienda Pura Vida» (SQLite) en el laboratorio de la página.
Python llega después y termina conectándose con SQL.

## Fase 1 — SQL: consultas (13 oct – 31 oct)

### s01 · Semana 1 · Tus primeras consultas (13 – 17 oct)
- 2026-10-13 mar · Bases de datos y SELECT — T1: Qué es una base de datos relacional (tablas, filas, columnas, clave primaria; recorrido por la Tienda Pura Vida y por el laboratorio) · T2: SELECT y FROM (columnas, *, alias con AS, expresiones simples como precio - costo)
- 2026-10-14 mié · Filtrar con WHERE — T1: WHERE y operadores de comparación (=, <>, <, >, <=, >=; texto entre comillas simples; fechas ISO como texto) · T2: AND, OR, NOT y paréntesis
- 2026-10-15 jue · Ordenar y limitar — T1: ORDER BY (ASC, DESC, varias columnas, por expresión o alias) · T2: LIMIT, OFFSET y DISTINCT
- 2026-10-16 vie · Filtros especiales — T1: LIKE (%, _), IN y BETWEEN · T2: NULL: IS NULL, IS NOT NULL y por qué `= NULL` no funciona
- 2026-10-17 sáb · Entregable semanal: «Consultas de la semana 1»

### s02 · Semana 2 · Calcular y resumir (19 – 24 oct)
- 2026-10-19 lun · Expresiones y funciones — T1: Aritmética y columnas calculadas (margen, ROUND, la trampa de la división entera) · T2: Funciones de texto (||, UPPER, LOWER, LENGTH, SUBSTR, REPLACE, TRIM, INSTR)
- 2026-10-20 mar · Decidir dentro de una consulta — T1: CASE WHEN (clasificar filas) · T2: COALESCE, IFNULL y NULLIF
- 2026-10-21 mié · Fechas en SQLite — T1: fechas ISO como texto, date() y strftime() (año, mes, día de la semana) · T2: cálculos con fechas: julianday, sumar días con date(fecha, '+7 days'), edades y antigüedad con la fecha de referencia '2026-09-30'
- 2026-10-22 jue · Funciones de agregación — T1: COUNT(*), COUNT(columna), COUNT(DISTINCT) y SUM · T2: AVG, MIN, MAX y redondeo de agregados
- 2026-10-23 vie · Agrupar con GROUP BY — T1: GROUP BY con una y varias columnas · T2: HAVING frente a WHERE y el orden lógico de ejecución de una consulta
- 2026-10-24 sáb · Entregable semanal: «Reportes de la semana 2»

### s03 · Semana 3 · Unir tablas (26 – 31 oct)
- 2026-10-26 lun · Relaciones e INNER JOIN — T1: Claves primarias y foráneas; cómo se relacionan las 8 tablas de la Tienda · T2: INNER JOIN ... ON, alias de tabla
- 2026-10-27 mar · JOIN de varias tablas — T1: Encadenar 3 y 4 tablas (pedidos → detalle → productos → categorías) · T2: JOIN + GROUP BY para reportes (ventas por categoría, por provincia, por vendedor)
- 2026-10-28 mié · LEFT JOIN — T1: LEFT JOIN y filas sin pareja · T2: Encontrar lo que falta (anti-join con IS NULL) y la diferencia entre filtrar en ON y en WHERE
- 2026-10-29 jue · Más formas de combinar — T1: Self join (empleados y sus jefes) y CROSS JOIN · T2: UNION, UNION ALL, INTERSECT y EXCEPT
- 2026-10-30 vie · Repaso integrador — T1: De la pregunta de negocio a la consulta (método en 5 pasos) · T2: Leer, depurar y mejorar consultas ajenas
- 2026-10-31 sáb · Mini-proyecto de fase: «Informe de ventas de la Tienda Pura Vida»

## Fase 2 — SQL: avanzado y diseño (2 nov – 21 nov)

### s04 · Semana 4 · Consultas avanzadas (2 – 7 nov)
- 2026-11-02 lun · Subconsultas — T1: Subconsulta escalar (comparar contra el promedio) · T2: Subconsultas con IN y en FROM (tablas derivadas)
- 2026-11-03 mar · Subconsultas correlacionadas — T1: Subconsultas correlacionadas · T2: EXISTS y NOT EXISTS
- 2026-11-04 mié · Consultas con WITH (CTE) — T1: WITH para ordenar las ideas, varias CTE encadenadas · T2: WITH RECURSIVE (jerarquía de empleados, serie de meses)
- 2026-11-05 jue · Funciones de ventana I — T1: OVER y PARTITION BY (comparar una fila con su grupo) · T2: ROW_NUMBER, RANK y DENSE_RANK (top N por grupo)
- 2026-11-06 vie · Funciones de ventana II — T1: Totales acumulados y marcos (SUM OVER ORDER BY, ROWS BETWEEN) · T2: LAG, LEAD (crecimiento mes a mes) y NTILE
- 2026-11-07 sáb · Entregable semanal: «Análisis avanzado de clientes»

### s05 · Semana 5 · Crear y modificar datos (9 – 14 nov)
- 2026-11-09 lun · Crear tablas — T1: CREATE TABLE y los tipos de SQLite (afinidad) · T2: Claves primarias, INTEGER PRIMARY KEY, DROP TABLE IF EXISTS
- 2026-11-10 mar · INSERT, UPDATE y DELETE — T1: INSERT (una fila, varias, INSERT ... SELECT) · T2: UPDATE y DELETE con WHERE (la regla de oro: primero el SELECT)
- 2026-11-11 mié · Restricciones — T1: NOT NULL, UNIQUE, CHECK y DEFAULT · T2: FOREIGN KEY, PRAGMA foreign_keys y ON DELETE
- 2026-11-12 jue · Transacciones y cambios de estructura — T1: BEGIN, COMMIT y ROLLBACK · T2: ALTER TABLE y UPSERT (INSERT ... ON CONFLICT)
- 2026-11-13 vie · Vistas e índices — T1: CREATE VIEW · T2: Índices y EXPLAIN QUERY PLAN
- 2026-11-14 sáb · Entregable semanal: «Módulo de inventario»

### s06 · Semana 6 · Diseñar bases de datos (16 – 21 nov)
- 2026-11-16 lun · Modelado de datos — T1: Entidades, atributos y relaciones (1:1, 1:N, N:M) · T2: Diagramas entidad-relación y tablas puente
- 2026-11-17 mar · Normalización — T1: Problemas de una tabla mal diseñada (redundancia y anomalías) y 1FN · T2: 2FN y 3FN con ejemplos
- 2026-11-18 mié · Del diseño al SQL — T1: Diseñar la base de una clínica veterinaria · T2: Crearla con SQL, cargar datos y probarla con consultas
- 2026-11-19 jue · Calidad de datos — T1: Encontrar duplicados, valores raros y nulos · T2: Limpiar con UPDATE, TRIM y LOWER y validar el resultado
- 2026-11-20 vie · Repaso de SQL y simulacro — T1: Los patrones de consulta que más se usan · T2: Simulacro de prueba técnica de SQL
- 2026-11-21 sáb · Mini-proyecto de fase: «Diseña tu propia base de datos»

## Fase 3 — Python y fundamentos de programación (23 nov – 5 dic)
(Cada día de Python trae además 2 ejercicios de «Repaso SQL» para no perder lo aprendido.)

### s07 · Semana 7 · Fundamentos de Python (23 – 28 nov)
- 2026-11-23 lun · Instalar Python y primer programa — T1: Python, VS Code y la terminal · T2: print, variables y tipos
- 2026-11-24 mar · Números, texto y entrada — T1: Operadores, input() y conversión de tipos, f-strings · T2: Métodos de texto
- 2026-11-25 mié · Decisiones — T1: if, elif, else y comparaciones · T2: and, or, not y validar entradas
- 2026-11-26 jue · Bucles — T1: while, break y continue · T2: for, range y acumuladores
- 2026-11-27 vie · Funciones — T1: def, parámetros y return · T2: Valores por defecto, alcance y docstrings
- 2026-11-28 sáb · Entregable semanal: «Calculadora de pedidos»

### s08 · Semana 8 · Colecciones y archivos (30 nov – 5 dic)
- 2026-11-30 lun · Listas y tuplas — T1: Listas, métodos y recorridos · T2: Slicing, tuplas y comprensiones de lista
- 2026-12-01 mar · Feriado: Día de la Abolición del Ejército
- 2026-12-02 mié · Diccionarios y conjuntos — T1: Diccionarios, items() y get() · T2: Listas de diccionarios (como filas de una tabla) y conjuntos
- 2026-12-03 jue · Archivos y CSV — T1: Leer y escribir archivos con with · T2: csv.DictReader y csv.DictWriter
- 2026-12-04 vie · Errores y módulos — T1: try, except y raise · T2: Módulos propios, import y if __name__ == "__main__"
- 2026-12-05 sáb · Entregable semanal: «Reporte de ventas desde CSV»

## Fase 4 — Python + SQL y proyecto final (7 dic – 30 dic)

### s09 · Semana 9 · POO y Python con SQL (7 – 12 dic)
- 2026-12-07 lun · Clases y objetos — T1: class, __init__, atributos y métodos · T2: __str__, encapsulación y propiedades
- 2026-12-08 mar · Herencia y dataclasses — T1: Herencia y super() · T2: @dataclass
- 2026-12-09 mié · sqlite3 desde Python — T1: connect, execute, fetchall y sqlite3.Row (con tienda.db descargada del laboratorio) · T2: Parámetros con ? e inyección SQL
- 2026-12-10 jue · Modificar datos desde Python — T1: INSERT y UPDATE con commit y transacciones (with con:) · T2: executemany y cargar un CSV a SQLite
- 2026-12-11 vie · Repositorio: POO + SQL — T1: El patrón repositorio (ProductoRepositorio) · T2: Pruebas con pytest y una base :memory:
- 2026-12-12 sáb · Mini-proyecto de fase: «App de consola de la Tienda»

### s10 · Semana 10 · Analizar datos y empezar el proyecto (14 – 19 dic)
- 2026-12-14 lun · pandas + SQL — T1: read_sql_query y DataFrame · T2: groupby y merge frente a GROUP BY y JOIN
- 2026-12-15 mar · Gráficas con matplotlib — T1: Barras y líneas desde una consulta · T2: Títulos, etiquetas y guardar la imagen
- 2026-12-16 mié · Git y GitHub — T1: init, add, commit y log · T2: GitHub, push y un buen README
- 2026-12-17 jue · Proyecto final: diseño — T1: Elegir el tema y las preguntas de negocio · T2: Diseñar las tablas y el diagrama
- 2026-12-18 vie · Proyecto final: datos — T1: Crear la base y cargar los datos con Python · T2: Verificar los datos con SQL
- 2026-12-19 sáb · Entregable semanal: «Plan y base de datos del proyecto final»

### s11 · Semana 11 · Construye el proyecto (21 – 26 dic)
- 2026-12-21 lun · Proyecto: consultas y reportes — T1: Responder las preguntas con SQL · T2: Reportes en Python
- 2026-12-22 mar · Proyecto: gráficas y pulido — T1: La gráfica del proyecto · T2: README, limpieza y pruebas
- 2026-12-23 mié · Simulacro final de SQL — T1: Repaso de todo SQL · T2: Simulacro cronometrado
- 2026-12-24 jue · Libre: Nochebuena
- 2026-12-25 vie · Feriado: Navidad
- 2026-12-26 sáb · Mini-proyecto: «Avance del proyecto final»

### s12 · Semana 12 · Cierre (28 – 30 dic)
- 2026-12-28 lun · Repaso de Python y POO — T1: Repaso de fundamentos y colecciones · T2: Repaso de POO y sqlite3
- 2026-12-29 mar · Repaso de SQL avanzado y presentación — T1: Repaso de CTE, ventanas y diseño · T2: Presentar tu proyecto en 5 minutos
- 2026-12-30 mié · Entregable final: «Proyecto final»
