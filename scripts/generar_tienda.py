"""
Genera la base de datos de práctica «Tienda Pura Vida» (SQLite) que usa el laboratorio SQL.

Es determinista: con la misma semilla siempre produce exactamente los mismos datos, para que los
ejercicios que se califican comparando resultados den siempre la misma respuesta.

Uso:  python3 scripts/generar_tienda.py   →  packages/shared/src/data/tienda.sql
"""
import random
import sqlite3
from datetime import date, timedelta
from pathlib import Path

random.seed(2026)
SALIDA = Path(__file__).resolve().parent.parent / "packages/shared/src/data/tienda.sql"

ESQUEMA = """
CREATE TABLE provincias (
  id      INTEGER PRIMARY KEY,
  nombre  TEXT NOT NULL UNIQUE
);

CREATE TABLE clientes (
  id                INTEGER PRIMARY KEY,
  nombre            TEXT NOT NULL,
  apellido          TEXT NOT NULL,
  email             TEXT UNIQUE,
  telefono          TEXT,
  provincia_id      INTEGER NOT NULL REFERENCES provincias(id),
  fecha_nacimiento  TEXT,
  fecha_registro    TEXT NOT NULL
);

CREATE TABLE categorias (
  id           INTEGER PRIMARY KEY,
  nombre       TEXT NOT NULL UNIQUE,
  descripcion  TEXT NOT NULL
);

CREATE TABLE productos (
  id                 INTEGER PRIMARY KEY,
  nombre             TEXT NOT NULL,
  categoria_id       INTEGER NOT NULL REFERENCES categorias(id),
  precio             INTEGER NOT NULL CHECK (precio > 0),
  costo              INTEGER NOT NULL CHECK (costo > 0),
  stock              INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  activo             INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  fecha_lanzamiento  TEXT NOT NULL
);

CREATE TABLE empleados (
  id             INTEGER PRIMARY KEY,
  nombre         TEXT NOT NULL,
  apellido       TEXT NOT NULL,
  puesto         TEXT NOT NULL,
  departamento   TEXT NOT NULL,
  salario        INTEGER NOT NULL,
  fecha_ingreso  TEXT NOT NULL,
  jefe_id        INTEGER REFERENCES empleados(id)
);

CREATE TABLE pedidos (
  id            INTEGER PRIMARY KEY,
  cliente_id    INTEGER NOT NULL REFERENCES clientes(id),
  empleado_id   INTEGER REFERENCES empleados(id),
  fecha         TEXT NOT NULL,
  estado        TEXT NOT NULL CHECK (estado IN ('pendiente', 'pagado', 'enviado', 'entregado', 'cancelado')),
  metodo_pago   TEXT NOT NULL CHECK (metodo_pago IN ('tarjeta', 'sinpe', 'efectivo', 'transferencia')),
  costo_envio   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE detalle_pedido (
  id               INTEGER PRIMARY KEY,
  pedido_id        INTEGER NOT NULL REFERENCES pedidos(id),
  producto_id      INTEGER NOT NULL REFERENCES productos(id),
  cantidad         INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario  INTEGER NOT NULL,
  descuento        REAL NOT NULL DEFAULT 0 CHECK (descuento >= 0 AND descuento < 1)
);

CREATE TABLE resenas (
  id            INTEGER PRIMARY KEY,
  producto_id   INTEGER NOT NULL REFERENCES productos(id),
  cliente_id    INTEGER NOT NULL REFERENCES clientes(id),
  calificacion  INTEGER NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
  comentario    TEXT,
  fecha         TEXT NOT NULL
);
""".strip()

PROVINCIAS = ["San José", "Alajuela", "Cartago", "Heredia", "Guanacaste", "Puntarenas", "Limón"]
PESO_PROVINCIA = [30, 18, 12, 14, 9, 9, 8]

NOMBRES = [
    "María", "José", "Ana", "Luis", "Carlos", "Sofía", "Valeria", "Daniel", "Andrés", "Fernanda",
    "Gabriela", "Diego", "Mariana", "Jorge", "Paola", "Kevin", "Natalia", "Esteban", "Melissa", "Pablo",
    "Laura", "Rodrigo", "Camila", "Alejandro", "Isabel", "Mauricio", "Karla", "Sebastián", "Adriana",
    "Fabián", "Raquel", "Javier", "Daniela", "Roberto", "Andrea", "Óscar", "Silvia", "Gerardo",
]
APELLIDOS = [
    "Rodríguez", "Jiménez", "Mora", "Vargas", "Rojas", "Solís", "Castro", "Chaves", "Araya", "Quesada",
    "Ramírez", "Hernández", "Alfaro", "Calderón", "Brenes", "Ulate", "Zúñiga", "Campos", "Arias", "Salas",
    "Villalobos", "Sánchez", "Montero", "Fallas", "Navarro", "Cordero", "Méndez", "Porras",
]
DOMINIOS = ["gmail.com"] * 6 + ["hotmail.com"] * 3 + ["yahoo.com", "outlook.com", "racsa.co.cr"]

CATEGORIAS = [
    ("Café y bebidas", "Café costarricense en grano y molido, y bebidas típicas."),
    ("Snacks y dulces", "Dulces tradicionales, chocolates y bocadillos."),
    ("Artesanía", "Piezas hechas a mano por artesanos del país."),
    ("Ropa", "Camisetas, gorras y accesorios de vestir."),
    ("Hogar y cocina", "Utensilios y decoración para la casa."),
    ("Cuidado personal", "Productos para el cuidado de la piel y el cuerpo."),
    ("Tecnología", "Accesorios electrónicos para el celular y la computadora."),
    ("Libros", "Libros de autores costarricenses (categoría nueva, todavía sin productos)."),
]

# (nombre, categoria_id, precio en colones, margen, stock, activo, fecha de lanzamiento)
PRODUCTOS = [
    ("Café molido Tarrazú 500 g", 1, 6500, 0.45, 120, 1, "2023-03-01"),
    ("Café en grano Naranjo 1 kg", 1, 12500, 0.42, 60, 1, "2023-03-01"),
    ("Café molido Orosi 250 g", 1, 3800, 0.48, 95, 1, "2023-06-15"),
    ("Café descafeinado 340 g", 1, 5900, 0.40, 0, 1, "2024-02-10"),
    ("Agua dulce instantánea", 1, 1900, 0.55, 210, 1, "2023-03-01"),
    ("Té de manzanilla orgánico", 1, 2800, 0.50, 40, 0, "2024-08-20"),
    ("Salsa Lizano 700 ml", 2, 2450, 0.30, 300, 1, "2023-03-01"),
    ("Tapa de dulce 1 kg", 2, 1650, 0.35, 150, 1, "2023-03-01"),
    ("Chocolate artesanal 70 % cacao", 2, 3500, 0.52, 80, 1, "2023-09-05"),
    ("Cajeta de leche", 2, 1200, 0.50, 180, 1, "2023-03-01"),
    ("Tosteles de coco", 2, 1500, 0.45, 0, 1, "2024-04-01"),
    ("Galletas de jengibre", 2, 1800, 0.47, 65, 1, "2025-11-15"),
    ("Maní garapiñado 250 g", 2, 2100, 0.44, 90, 1, "2024-01-20"),
    ("Carreta típica de Sarchí (mediana)", 3, 18500, 0.38, 15, 1, "2023-03-01"),
    ("Carreta típica de Sarchí (miniatura)", 3, 7500, 0.40, 40, 1, "2023-03-01"),
    ("Máscara boruca tallada", 3, 45000, 0.35, 6, 1, "2023-05-12"),
    ("Hamaca de algodón", 3, 32000, 0.33, 10, 1, "2023-07-01"),
    ("Pulsera de semillas", 3, 2500, 0.60, 140, 1, "2023-03-01"),
    ("Cuadro de colibrí pintado a mano", 3, 28000, 0.40, 4, 0, "2024-03-18"),
    ("Camiseta Pura Vida", 4, 9500, 0.55, 200, 1, "2023-03-01"),
    ("Gorra bordada Costa Rica", 4, 8500, 0.55, 75, 1, "2023-04-10"),
    ("Bolso de manta", 4, 6500, 0.50, 0, 1, "2023-10-02"),
    ("Sudadera con capucha Tico", 4, 19500, 0.45, 35, 1, "2025-10-01"),
    ("Pañoleta de colores", 4, 5500, 0.52, 50, 0, "2024-06-30"),
    ("Chorreador de café de madera", 5, 14500, 0.42, 30, 1, "2023-03-01"),
    ("Bolsita de chorreador (tela)", 5, 1500, 0.60, 260, 1, "2023-03-01"),
    ("Taza de cerámica pintada", 5, 6000, 0.48, 85, 1, "2023-08-08"),
    ("Tabla de picar de teca", 5, 11500, 0.40, 22, 1, "2024-05-05"),
    ("Juego de 4 individuales de tela", 5, 9800, 0.45, 18, 1, "2025-02-14"),
    ("Molinillo de café manual", 5, 21000, 0.35, 0, 0, "2024-09-09"),
    ("Jabón de avena y miel", 6, 2200, 0.58, 160, 1, "2023-03-01"),
    ("Bloqueador solar SPF 50", 6, 8900, 0.30, 70, 1, "2023-11-20"),
    ("Repelente natural de citronela", 6, 4500, 0.45, 55, 1, "2024-01-08"),
    ("Aceite de coco 250 ml", 6, 3900, 0.50, 0, 1, "2024-07-22"),
    ("Crema de aloe vera", 6, 4200, 0.48, 48, 1, "2025-06-01"),
    ("Audífonos inalámbricos", 7, 24900, 0.25, 25, 1, "2023-12-01"),
    ("Cargador USB-C 30 W", 7, 12900, 0.30, 45, 1, "2024-02-01"),
    ("Batería portátil 10 000 mAh", 7, 17500, 0.28, 30, 1, "2024-04-15"),
    ("Funda de celular con diseño de tucán", 7, 7900, 0.55, 90, 1, "2024-10-10"),
    ("Parlante bluetooth resistente al agua", 7, 29900, 0.27, 12, 1, "2025-03-03"),
    ("Mouse inalámbrico", 7, 9900, 0.32, 0, 0, "2023-05-05"),
    ("Cable HDMI 2 m", 7, 4500, 0.40, 65, 1, "2026-08-01"),
]

# (nombre, apellido, puesto, departamento, salario, fecha_ingreso, jefe_id)
EMPLEADOS = [
    ("Laura", "Méndez", "Gerente general", "Gerencia", 2450000, "2019-02-01", None),
    ("Ricardo", "Solano", "Jefe de ventas", "Ventas", 1650000, "2019-06-15", 1),
    ("Ana Lucía", "Barrantes", "Jefa de bodega", "Bodega", 1380000, "2020-01-10", 1),
    ("Mónica", "Esquivel", "Jefa de servicio al cliente", "Servicio al cliente", 1320000, "2020-08-03", 1),
    ("Felipe", "Arguedas", "Vendedor", "Ventas", 780000, "2021-03-01", 2),
    ("Priscilla", "Umaña", "Vendedora", "Ventas", 820000, "2020-11-16", 2),
    ("Marco", "Leiva", "Vendedor", "Ventas", 760000, "2022-05-02", 2),
    ("Yorleny", "Cascante", "Vendedora", "Ventas", 745000, "2023-09-18", 2),
    ("Bryan", "Obando", "Vendedor", "Ventas", 700000, "2025-04-07", 2),
    ("Hugo", "Sibaja", "Bodeguero", "Bodega", 610000, "2021-07-12", 3),
    ("Wendy", "Aguilar", "Bodeguera", "Bodega", 610000, "2022-10-03", 3),
    ("Cristian", "Murillo", "Agente de servicio", "Servicio al cliente", 650000, "2023-01-09", 4),
    ("Tatiana", "Sequeira", "Agente de servicio", "Servicio al cliente", 670000, "2021-12-01", 4),
    ("Álvaro", "Gamboa", "Analista de datos", "Gerencia", 1150000, "2024-06-03", 1),
]
VENDEDORES = [5, 6, 7, 8, 9]

COMENTARIOS = {
    5: ["Excelente, lo recomiendo.", "Llegó rapidísimo y en perfecto estado.", "Me encantó, voy a comprar otro.",
        "Muy buena calidad.", "El mejor que he probado."],
    4: ["Muy bueno, pero el envío tardó un poco.", "Buena calidad por el precio.", "Me gustó bastante.",
        "Bien empacado."],
    3: ["Está bien, nada especial.", "Cumple, pero esperaba más.", "Regular."],
    2: ["No era lo que esperaba.", "Llegó con un golpe.", "La calidad podría mejorar."],
    1: ["Muy malo, no lo recomiendo.", "Llegó dañado y nadie respondió.", "Pésima experiencia."],
}


def fecha_al_azar(inicio: date, fin: date) -> date:
    return inicio + timedelta(days=random.randint(0, (fin - inicio).days))


def sin_tildes(texto: str) -> str:
    tabla = str.maketrans("áéíóúÁÉÍÓÚñÑü", "aeiouAEIOUnNu")
    return texto.translate(tabla)


def sql_valor(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def generar():
    filas: dict[str, list[tuple]] = {}

    filas["provincias"] = [(i + 1, n) for i, n in enumerate(PROVINCIAS)]

    # ---------- clientes ----------
    clientes = []
    usados = set()
    for cid in range(1, 81):
        nombre = random.choice(NOMBRES)
        apellido = random.choice(APELLIDOS)
        base = sin_tildes(f"{nombre}.{apellido}").lower().replace(" ", "")
        email = f"{base}@{random.choice(DOMINIOS)}"
        n = 2
        while email in usados:
            email = f"{base}{n}@{random.choice(DOMINIOS)}"
            n += 1
        if random.random() < 0.06:
            email = None
        else:
            usados.add(email)
        telefono = None if random.random() < 0.15 else f"{random.choice('678')}{random.randint(0, 999):03d}-{random.randint(0, 9999):04d}"
        provincia = random.choices(range(1, 8), weights=PESO_PROVINCIA)[0]
        nacimiento = None if random.random() < 0.2 else fecha_al_azar(date(1958, 1, 1), date(2006, 12, 31)).isoformat()
        registro = fecha_al_azar(date(2024, 1, 15), date(2026, 9, 20)).isoformat()
        clientes.append((cid, nombre, apellido, email, telefono, provincia, nacimiento, registro))
    filas["clientes"] = clientes

    filas["categorias"] = [(i + 1, n, d) for i, (n, d) in enumerate(CATEGORIAS)]

    productos = []
    for pid, (nombre, cat, precio, margen, stock, activo, lanz) in enumerate(PRODUCTOS, start=1):
        costo = int(round(precio * (1 - margen) / 50) * 50)
        productos.append((pid, nombre, cat, precio, costo, stock, activo, lanz))
    filas["productos"] = productos

    filas["empleados"] = [(i + 1, *e) for i, e in enumerate(EMPLEADOS)]

    # ---------- pedidos y detalle ----------
    # Algunos clientes nunca compran (sirve para LEFT JOIN y NOT EXISTS).
    sin_compras = set(random.sample(range(1, 81), 11))
    compradores = [c for c in clientes if c[0] not in sin_compras]
    # Clientes frecuentes: pesos desiguales para que haya un "top" claro.
    peso_cliente = {c[0]: random.choice([1, 1, 1, 2, 2, 3, 5, 8]) for c in compradores}
    # Productos que nunca se venden.
    nunca_vendidos = {11, 19, 29, 34, 42}
    vendibles = [p for p in productos if p[0] not in nunca_vendidos]
    popularidad = {p[0]: random.choice([1, 1, 2, 2, 3, 4, 6, 9]) for p in vendibles}
    popularidad[7] = 14   # Salsa Lizano
    popularidad[1] = 12   # Café Tarrazú
    popularidad[20] = 10  # Camiseta

    pedidos, detalle = [], []
    did = 1
    inicio, fin = date(2025, 1, 2), date(2026, 9, 30)
    dias = [inicio + timedelta(days=i) for i in range((fin - inicio).days + 1)]
    peso_dia = []
    for d in dias:
        w = 1.0
        if d.month == 12:
            w = 2.6
        elif d.month in (11, 7):
            w = 1.4
        if d.weekday() >= 5:
            w *= 1.3
        if d.year == 2026:
            w *= 1.25
        peso_dia.append(w)
    fechas = sorted(random.choices(dias, weights=peso_dia, k=420))

    for pid, f in enumerate(fechas, start=1):
        posibles = [c for c in compradores if c[7] <= f.isoformat()]
        if not posibles:
            posibles = compradores[:5]
        cliente = random.choices(posibles, weights=[peso_cliente[c[0]] for c in posibles])[0]
        empleado = None if random.random() < 0.45 else random.choice(
            [v for v in VENDEDORES if EMPLEADOS[v - 1][5] <= f.isoformat()]
        )
        dias_atras = (date(2026, 9, 30) - f).days
        if dias_atras <= 3:
            estado = random.choice(["pendiente", "pagado", "pagado"])
        elif dias_atras <= 10:
            estado = random.choice(["pagado", "enviado", "enviado", "entregado"])
        else:
            estado = random.choices(["entregado", "cancelado"], weights=[92, 8])[0]
        metodo = random.choices(["tarjeta", "sinpe", "efectivo", "transferencia"], weights=[40, 38, 12, 10])[0]
        if empleado is None and metodo == "efectivo":
            metodo = "sinpe"
        envio = 0 if empleado is not None else random.choice([2500, 2500, 3000, 3500, 0])
        pedidos.append((pid, cliente[0], empleado, f.isoformat(), estado, metodo, envio))

        lineas = random.choices([1, 2, 3, 4], weights=[38, 32, 20, 10])[0]
        disponibles = [p for p in vendibles if p[7] <= f.isoformat()]
        elegidos = []
        while len(elegidos) < lineas:
            p = random.choices(disponibles, weights=[popularidad[x[0]] for x in disponibles])[0]
            if p not in elegidos:
                elegidos.append(p)
        for p in elegidos:
            cantidad = random.choices([1, 2, 3, 4, 6], weights=[55, 25, 10, 6, 4])[0]
            precio = p[3] if f.year == 2026 else int(round(p[3] * 0.94 / 50) * 50)
            descuento = random.choices([0, 0.05, 0.1, 0.15], weights=[78, 10, 8, 4])[0]
            detalle.append((did, pid, p[0], cantidad, precio, descuento))
            did += 1
    filas["pedidos"] = pedidos
    filas["detalle_pedido"] = detalle

    # ---------- reseñas: solo de productos que el cliente compró y recibió ----------
    entregados = {p[0]: p for p in pedidos if p[4] == "entregado"}
    compras = sorted({(entregados[d[1]][1], d[2], entregados[d[1]][3]) for d in detalle if d[1] in entregados})
    resenas = []
    rid = 1
    vistos = set()
    sesgo = {16: 5, 1: 5, 2: 5, 36: 3, 22: 2, 7: 4}
    for cliente_id, producto_id, fecha_pedido in compras:
        if (cliente_id, producto_id) in vistos or random.random() > 0.33:
            continue
        vistos.add((cliente_id, producto_id))
        centro = sesgo.get(producto_id, 4)
        nota = max(1, min(5, round(random.gauss(centro, 1.0))))
        comentario = None if random.random() < 0.25 else random.choice(COMENTARIOS[nota])
        f = date.fromisoformat(fecha_pedido) + timedelta(days=random.randint(3, 25))
        if f > date(2026, 10, 5):
            continue
        resenas.append((rid, producto_id, cliente_id, nota, comentario, f.isoformat()))
        rid += 1
    resenas.sort(key=lambda r: (r[5], r[0]))
    resenas = [(i + 1, *r[1:]) for i, r in enumerate(resenas)]
    filas["resenas"] = resenas
    return filas


def main():
    filas = generar()
    columnas = {
        "provincias": "id, nombre",
        "clientes": "id, nombre, apellido, email, telefono, provincia_id, fecha_nacimiento, fecha_registro",
        "categorias": "id, nombre, descripcion",
        "productos": "id, nombre, categoria_id, precio, costo, stock, activo, fecha_lanzamiento",
        "empleados": "id, nombre, apellido, puesto, departamento, salario, fecha_ingreso, jefe_id",
        "pedidos": "id, cliente_id, empleado_id, fecha, estado, metodo_pago, costo_envio",
        "detalle_pedido": "id, pedido_id, producto_id, cantidad, precio_unitario, descuento",
        "resenas": "id, producto_id, cliente_id, calificacion, comentario, fecha",
    }
    partes = [
        "-- Tienda Pura Vida: base de datos de práctica (SQLite).",
        "-- Generada por scripts/generar_tienda.py. No la edites a mano: cambia el script y vuelve a generarla.",
        "",
        ESQUEMA,
        "",
    ]
    for tabla, cols in columnas.items():
        valores = ",\n".join("  (" + ", ".join(sql_valor(v) for v in fila) + ")" for fila in filas[tabla])
        partes.append(f"INSERT INTO {tabla} ({cols}) VALUES\n{valores};\n")
    texto = "\n".join(partes)
    SALIDA.write_text(texto, encoding="utf-8")

    con = sqlite3.connect(":memory:")
    con.executescript("PRAGMA foreign_keys = ON;\n" + texto)
    for tabla in columnas:
        print(f"{tabla:15} {con.execute(f'SELECT COUNT(*) FROM {tabla}').fetchone()[0]:5} filas")
    print(f"→ {SALIDA} ({len(texto.encode()) // 1024} KB)")


if __name__ == "__main__":
    main()
