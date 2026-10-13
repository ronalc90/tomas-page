"""
Valida y construye el plan de estudio.

El contenido se escribe en content/semanas/sNN.json (una semana por archivo) y este script:
  - valida la estructura de cada día, entregable y pregunta;
  - ejecuta TODO el SQL contra la base de práctica (packages/shared/src/data/tienda.sql):
    soluciones de ejercicios, ejemplos, pasos y retos;
  - comprueba que la solución de cada ejercicio es determinista (mismo resultado aunque SQLite
    recorra las tablas en otro orden) y devuelve un resultado razonable;
  - ejecuta los ejemplos de Python y compara la salida con exampleOutput;
  - rellena exampleOutput de los ejemplos SQL con la tabla real que devuelven;
  - arma packages/shared/src/data/plan.json.

Uso:
  python3 scripts/plan.py validar            # todas las semanas
  python3 scripts/plan.py validar s03        # una semana
  python3 scripts/plan.py construir          # valida todo y escribe plan.json
"""
from __future__ import annotations

import json
import re
import sqlite3
import subprocess
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SEMANAS = RAIZ / "content/semanas"
FASES = RAIZ / "content/fases.json"
TIENDA = (RAIZ / "packages/shared/src/data/tienda.sql").read_text(encoding="utf-8")
SALIDA = RAIZ / "packages/shared/src/data/plan.json"

INICIO, FIN = date(2026, 10, 13), date(2026, 12, 30)
FESTIVOS = {"2026-12-01": "holiday", "2026-12-24": "free", "2026-12-25": "holiday"}
TIPOS_PREGUNTA = {"choice", "boolean", "output", "fill"}
LENGUAJES = {"python", "sql", "bash"}


class Informe:
    def __init__(self) -> None:
        self.errores: list[str] = []
        self.avisos: list[str] = []

    def error(self, donde: str, msg: str) -> None:
        self.errores.append(f"ERROR  {donde}: {msg}")

    def aviso(self, donde: str, msg: str) -> None:
        self.avisos.append(f"AVISO  {donde}: {msg}")


# ---------------------------------------------------------------- SQL

_NORMAL: sqlite3.Connection | None = None
_INVERTIDA: sqlite3.Connection | None = None


def _plantillas() -> tuple[sqlite3.Connection, sqlite3.Connection]:
    """La base normal y una «invertida»: mismos datos, pero guardados en orden inverso y sin que el id
    sea el rowid. Si una consulta da otro resultado en la invertida, su resultado depende del orden
    interno de SQLite (p. ej. empates en ORDER BY) y no es determinista."""
    global _NORMAL, _INVERTIDA
    if _NORMAL is None or _INVERTIDA is None:
        _NORMAL = sqlite3.connect(":memory:")
        _NORMAL.executescript(TIENDA)
        esquema = TIENDA.split("INSERT INTO")[0].replace("id      INTEGER PRIMARY KEY", "id INTEGER NOT NULL UNIQUE")
        esquema = re.sub(r"\bid(\s+)INTEGER PRIMARY KEY", r"id\1INTEGER NOT NULL UNIQUE", esquema)
        _INVERTIDA = sqlite3.connect(":memory:")
        _INVERTIDA.executescript(esquema)
        tablas = [r[0] for r in _NORMAL.execute("SELECT name FROM sqlite_master WHERE type = 'table'")]
        for t in tablas:
            filas = _NORMAL.execute(f"SELECT * FROM {t} ORDER BY id DESC").fetchall()
            if filas:
                marcas = ", ".join("?" * len(filas[0]))
                _INVERTIDA.executemany(f"INSERT INTO {t} VALUES ({marcas})", filas)
        _INVERTIDA.commit()
    return _NORMAL, _INVERTIDA


def base_nueva(invertir: bool = False) -> sqlite3.Connection:
    normal, invertida = _plantillas()
    con = sqlite3.connect(":memory:")
    (invertida if invertir else normal).backup(con)
    if invertir:
        con.execute("PRAGMA reverse_unordered_selects = ON")
    return con


def ejecutar(sql: str, invertir: bool = False, previo: str = "") -> tuple[list[str], list[tuple]] | None:
    """Ejecuta un script SQL y devuelve columnas y filas de la ÚLTIMA sentencia que devuelve filas."""
    con = base_nueva(invertir)
    if previo:
        _correr_script(con, previo)
    return _correr_script(con, sql)


def _correr_script(con: sqlite3.Connection, sql: str):
    ultimo = None
    for sentencia in dividir(sql):
        cur = con.execute(sentencia)
        if cur.description:
            ultimo = ([d[0] for d in cur.description], cur.fetchall())
    return ultimo


def dividir(sql: str) -> list[str]:
    """Divide un script en sentencias completas (respeta comillas y BEGIN...END de triggers)."""
    partes, actual = [], ""
    for linea in sql.splitlines(keepends=True):
        actual += linea
        if sqlite3.complete_statement(actual):
            if actual.strip():
                partes.append(actual.strip())
            actual = ""
    if actual.strip():
        partes.append(actual.strip())
    return [p for p in partes if re.sub(r"--[^\n]*", "", p).strip(" ;\n\t")]


def normalizar(filas: list[tuple]) -> list[tuple]:
    def v(x):
        if isinstance(x, float):
            r = round(x, 2)
            return int(r) if r == int(r) else r
        if isinstance(x, bytes):
            return x.hex()
        return x
    return [tuple(v(x) for x in f) for f in filas]


def clave_orden(fila: tuple):
    return tuple((0, "") if x is None else (1, str(type(x).__name__), x) if not isinstance(x, (int, float)) else (1, "num", x) for x in fila)


def tabla_texto(columnas: list[str], filas: list[tuple], maximo: int = 10) -> str:
    def celda(x) -> str:
        if x is None:
            return "NULL"
        if isinstance(x, float):
            r = round(x, 2)
            return str(int(r)) if r == int(r) else f"{r}"
        s = str(x)
        return s if len(s) <= 42 else s[:41] + "…"
    vis = [[celda(x) for x in f] for f in filas[:maximo]]
    anchos = [max([len(c)] + [len(f[i]) for f in vis]) for i, c in enumerate(columnas)]
    num = [all(isinstance(f[i], (int, float)) or f[i] is None for f in filas[:maximo]) and filas for i in range(len(columnas))]

    def linea(valores):
        return " | ".join((v.rjust(anchos[i]) if num[i] else v.ljust(anchos[i])) for i, v in enumerate(valores)).rstrip()
    out = [linea(columnas), "-+-".join("-" * a for a in anchos)]
    out += [linea(f) for f in vis]
    n = len(filas)
    if n > maximo:
        out.append(f"… ({n} filas en total)")
    else:
        out.append(f"({n} fila{'s' if n != 1 else ''})")
    return "\n".join(out)


# ---------------------------------------------------------------- Python

def correr_python(codigo: str) -> tuple[bool, str]:
    with tempfile.TemporaryDirectory() as tmp:
        archivo = Path(tmp) / "ejemplo.py"
        archivo.write_text(codigo, encoding="utf-8")
        # El ejemplo encuentra en su carpeta la misma tienda.db que Tomás descarga del laboratorio.
        base = sqlite3.connect(Path(tmp) / "tienda.db")
        base.executescript(TIENDA)
        base.close()
        try:
            r = subprocess.run([sys.executable, "-I", str(archivo)], cwd=tmp, capture_output=True, text=True, timeout=30, input="",
                               env={"MPLBACKEND": "Agg", "PATH": "/usr/bin:/bin", "HOME": tmp})
        except subprocess.TimeoutExpired:
            return False, "tardó más de 15 s"
        return r.returncode == 0, (r.stdout if r.returncode == 0 else r.stderr[-600:])


# ---------------------------------------------------------------- Validación

def texto(inf: Informe, donde: str, valor, minimo: int = 1) -> None:
    if not isinstance(valor, str) or len(valor.strip()) < minimo:
        inf.error(donde, f"texto vacío o demasiado corto (mínimo {minimo} caracteres)")


def lista_textos(inf: Informe, donde: str, valor, minimo: int, maximo: int = 99) -> None:
    if not isinstance(valor, list) or not (minimo <= len(valor) <= maximo) or not all(isinstance(x, str) and x.strip() for x in valor):
        inf.error(donde, f"debe ser una lista de {minimo} a {maximo} textos no vacíos")


def validar_sql_ejecutable(inf: Informe, donde: str, sql: str) -> None:
    try:
        ejecutar(sql)
    except Exception as e:  # noqa: BLE001
        inf.error(donde, f"el SQL falla contra la base Tienda: {e}\n         SQL: {sql[:300]}")


def validar_ejercicio(inf: Informe, donde: str, ej: dict, ids: set[str]) -> None:
    for campo in ("id", "title", "prompt", "hint", "solution"):
        texto(inf, f"{donde}.{campo}", ej.get(campo))
    if not isinstance(ej.get("orderMatters"), bool):
        inf.error(donde, "orderMatters debe ser true o false")
    for campo in ("check", "starter", "setup"):
        if not isinstance(ej.get(campo, ""), str):
            inf.error(donde, f"{campo} debe ser texto (\"\" si no aplica)")
    eid = ej.get("id", "")
    if eid in ids:
        inf.error(donde, f"id de ejercicio repetido: {eid}")
    ids.add(eid)
    if not re.fullmatch(r"[a-z0-9-]+", eid or ""):
        inf.error(donde, "el id solo puede tener minúsculas, números y guiones")
    sol, check, setup = ej.get("solution", ""), ej.get("check", ""), ej.get("setup", "")
    if re.search(r"\b(now|random|current_date|current_timestamp|current_time)\b", (sol + check).lower()):
        inf.error(donde, "la solución usa now/random/CURRENT_DATE: el resultado cambiaría según el día. Usa la fecha de referencia '2026-09-30'.")
    try:
        if check:
            normal = _con_check(sol, check, setup, False)
            invertido = _con_check(sol, check, setup, True, perturbar=False)
        else:
            normal = ejecutar(sol, previo=setup)
            invertido = ejecutar(sol, invertir=True, previo=setup)
    except Exception as e:  # noqa: BLE001
        inf.error(donde, f"la solución falla: {e}")
        return
    if normal is None:
        inf.error(donde, "la solución no devuelve filas (si modifica datos, define `check` con un SELECT que muestre el efecto)")
        return
    cols, filas = normal
    a, b = normalizar(filas), normalizar(invertido[1])
    if ej.get("orderMatters"):
        if not re.search(r"order\s+by", (check or sol), re.I):
            inf.error(donde, "orderMatters es true pero la consulta no tiene ORDER BY")
        if a != b:
            inf.error(donde, "el orden del resultado NO es determinista (hay empates en el ORDER BY). Agrega una columna de desempate, p. ej. `, id`.")
    else:
        if sorted(a, key=clave_orden) != sorted(b, key=clave_orden):
            inf.error(donde, "el resultado cambia según el orden interno de SQLite (¿LIMIT con empates?). Hazlo determinista.")
    if len(filas) == 0:
        inf.error(donde, "la solución devuelve 0 filas: el ejercicio no se puede comprobar bien")
    if len(filas) > 150:
        inf.aviso(donde, f"la solución devuelve {len(filas)} filas; mejor menos de 150")
    if len(set(cols)) != len(cols):
        inf.aviso(donde, f"columnas con nombres repetidos: {cols}")
    ej["_preview"] = tabla_texto(cols, filas, 5)


def _con_check(sol: str, check: str, setup: str, invertir: bool, perturbar: bool = True):
    con = base_nueva(invertir and perturbar)
    if invertir and not perturbar:
        con.execute("PRAGMA reverse_unordered_selects = ON")
    if setup:
        _correr_script(con, setup)
    _correr_script(con, sol)
    return _correr_script(con, check)


def validar_pregunta(inf: Informe, donde: str, q: dict) -> None:
    t = q.get("type")
    if t not in TIPOS_PREGUNTA:
        inf.error(donde, f"type inválido: {t}")
        return
    texto(inf, f"{donde}.prompt", q.get("prompt"), 10)
    texto(inf, f"{donde}.explanation", q.get("explanation"), 15)
    texto(inf, f"{donde}.hint", q.get("hint"), 8)
    opciones = q.get("options", [])
    if t in ("choice", "boolean"):
        n = 2 if t == "boolean" else 4
        if t == "boolean" and opciones != ["Verdadero", "Falso"]:
            inf.error(donde, 'las preguntas boolean usan options ["Verdadero", "Falso"]')
        if len(opciones) != n:
            inf.error(donde, f"debe tener {n} opciones")
        if not isinstance(q.get("correctIndex"), int) or not (0 <= q["correctIndex"] < len(opciones)):
            inf.error(donde, "correctIndex fuera de rango")
        fb = q.get("optionFeedback", [])
        if len(fb) != len(opciones) or not all(isinstance(x, str) and x.strip() for x in fb):
            inf.error(donde, "optionFeedback debe tener un comentario por opción")
        if len(set(opciones)) != len(opciones):
            inf.error(donde, "opciones repetidas")
    else:
        acc = q.get("accepted", [])
        if not acc or not all(isinstance(x, str) and x.strip() for x in acc):
            inf.error(donde, "las preguntas output/fill necesitan accepted con al menos una respuesta")
        if t == "fill" and "___" not in q.get("code", ""):
            inf.error(donde, "las preguntas fill marcan el hueco con ___ en code")
        if t == "output" and not q.get("code", "").strip():
            inf.error(donde, "las preguntas output necesitan code")
        if t == "output" and _parece_sql(q.get("code", "")):
            try:
                r = ejecutar(q["code"])
                if r and len(r[1]) == 1 and len(r[0]) == 1:
                    real = tabla_texto(r[0], r[1]).splitlines()[2].strip()
                    if acc and _norm_resp(acc[0]) != _norm_resp(real):
                        inf.error(donde, f"accepted[0] = {acc[0]!r} pero la consulta devuelve {real!r}")
            except Exception as e:  # noqa: BLE001
                inf.error(donde, f"el SQL de la pregunta falla: {e}")


def _norm_resp(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().strip("'\"")).lower()


def _parece_sql(code: str) -> bool:
    return bool(re.match(r"\s*(select|with)\b", code, re.I))


def validar_tema(inf: Informe, donde: str, t: dict) -> None:
    texto(inf, f"{donde}.title", t.get("title"))
    texto(inf, f"{donde}.concept", t.get("concept"), 400)
    texto(inf, f"{donde}.tip", t.get("tip"), 40)
    lang = t.get("language")
    if lang not in LENGUAJES:
        inf.error(donde, f"language inválido: {lang}")
    texto(inf, f"{donde}.example", t.get("example"), 10)
    if lang == "sql":
        try:
            r = ejecutar(t["example"])
            if r is None:
                inf.error(donde, "el ejemplo SQL no devuelve filas: termina con un SELECT que muestre el resultado")
            else:
                t["exampleOutput"] = tabla_texto(*r)
        except Exception as e:  # noqa: BLE001
            inf.error(donde, f"el ejemplo SQL falla: {e}")
    elif lang == "python":
        if "input(" in t.get("example", ""):
            if not t.get("exampleOutput", "").strip():
                inf.error(donde, "el ejemplo usa input(): escribe en exampleOutput una sesión de ejemplo")
        else:
            ok, salida = correr_python(t.get("example", ""))
            if not ok:
                inf.error(donde, f"el ejemplo de Python falla:\n{salida}")
            elif salida.strip() != t.get("exampleOutput", "").strip():
                inf.error(donde, f"exampleOutput no coincide con lo que imprime el ejemplo.\n         Imprime:\n{salida}")
    pasos = t.get("steps", [])
    if not (3 <= len(pasos) <= 6):
        inf.error(donde, "debe tener de 3 a 6 pasos en steps")
    for i, p in enumerate(pasos):
        d = f"{donde}.steps[{i}]"
        texto(inf, f"{d}.title", p.get("title"))
        texto(inf, f"{d}.body", p.get("body"), 60)
        if p.get("language") not in LENGUAJES:
            inf.error(d, "language inválido")
        if p.get("code") and p.get("language") == "sql" and not p.get("noRun"):
            validar_sql_ejecutable(inf, d, p["code"])
        if p.get("code") and p.get("language") == "python" and "input(" not in p["code"] and not p.get("noRun"):
            ok, salida = correr_python(p["code"])
            if not ok:
                inf.error(d, f"el código de Python falla (si es a propósito o depende de archivos, pon \"noRun\": true):\n{salida}")
    errores = t.get("commonErrors", [])
    if not (2 <= len(errores) <= 5):
        inf.error(donde, "debe tener de 2 a 5 commonErrors")
    for i, e in enumerate(errores):
        for campo in ("error", "cause", "fix"):
            texto(inf, f"{donde}.commonErrors[{i}].{campo}", e.get(campo))


def validar_dia(inf: Informe, d: dict, ids: set[str]) -> None:
    donde = d.get("date", "?")
    if d.get("kind") != "workshop":
        texto(inf, f"{donde}.title", d.get("title"))
        return
    texto(inf, f"{donde}.title", d.get("title"))
    texto(inf, f"{donde}.summary", d.get("summary"), 40)
    lista_textos(inf, f"{donde}.objectives", d.get("objectives"), 3, 6)
    agenda = d.get("schedule", [])
    total = sum(b.get("minutes", 0) for b in agenda)
    if not (200 <= total <= 260):
        inf.error(donde, f"la agenda suma {total} min; debe sumar entre 200 y 260 (unas 4 horas)")
    temas = d.get("topics", [])
    if len(temas) != 2:
        inf.error(donde, "cada día tiene exactamente 2 temas")
    for i, t in enumerate(temas):
        validar_tema(inf, f"{donde}.topics[{i}]", t)
    tareas, pistas = d.get("tasks", []), d.get("taskHints", [])
    if len(tareas) != len(pistas):
        inf.error(donde, "tasks y taskHints deben tener el mismo largo")
    ejercicios = d.get("exercises", [])
    if not tareas and not ejercicios:
        inf.error(donde, "el día no tiene ni tareas ni ejercicios")
    for i, ej in enumerate(ejercicios):
        validar_ejercicio(inf, f"{donde}.exercises[{i}]", ej, ids)
    ch = d.get("challenge")
    if not ch:
        inf.error(donde, "falta challenge")
    else:
        for campo in ("title", "description", "hint", "solution"):
            texto(inf, f"{donde}.challenge.{campo}", ch.get(campo))
        if ch.get("language") == "sql":
            validar_sql_ejecutable(inf, f"{donde}.challenge", ch.get("solution", ""))
        elif ch.get("language") == "python" and "input(" not in ch.get("solution", "") and not ch.get("noRun"):
            ok, salida = correr_python(ch.get("solution", ""))
            if not ok:
                inf.error(f"{donde}.challenge", f"la solución de Python falla:\n{salida}")
    glos = d.get("glossary", [])
    if not (4 <= len(glos) <= 8):
        inf.error(donde, "glossary debe tener de 4 a 8 términos")
    rec = d.get("resources", [])
    if not (2 <= len(rec) <= 5) or not all(str(r.get("url", "")).startswith("https://") for r in rec):
        inf.error(donde, "resources: de 2 a 5 enlaces https")
    preguntas = d.get("questions", [])
    if len(preguntas) != 8:
        inf.error(donde, f"debe tener 8 preguntas (tiene {len(preguntas)})")
    tipos = {q.get("type") for q in preguntas}
    if len(tipos) < 3:
        inf.error(donde, "usa al menos 3 tipos de pregunta distintos")
    for i, q in enumerate(preguntas):
        validar_pregunta(inf, f"{donde}.questions[{i}]", q)
    correctas = [q.get("correctIndex") for q in preguntas if q.get("type") == "choice"]
    if len(correctas) >= 3 and len(set(correctas)) == 1:
        inf.aviso(donde, "todas las preguntas de opción múltiple tienen la respuesta en la misma posición")


def validar_entregable(inf: Informe, semana: dict, ids: set[str]) -> None:
    e = semana.get("deliverable") or {}
    donde = f"{semana.get('id')}.deliverable"
    if e.get("kind") not in ("weekly", "mini-project", "final"):
        inf.error(donde, "kind inválido")
    for campo in ("dueDate", "path", "description", "stretch"):
        texto(inf, f"{donde}.{campo}", e.get(campo))
    lista_textos(inf, f"{donde}.criteria", e.get("criteria"), 3, 8)
    lista_textos(inf, f"{donde}.steps", e.get("steps"), 3, 10)
    lista_textos(inf, f"{donde}.tips", e.get("tips"), 2, 6)
    lista_textos(inf, f"{donde}.checklist", e.get("checklist"), 3, 10)
    for i, ej in enumerate(e.get("exercises", [])):
        validar_ejercicio(inf, f"{donde}.exercises[{i}]", ej, ids)


def fechas_esperadas() -> dict[str, list[str]]:
    """Semana (lunes) → fechas de lunes a viernes dentro del plan."""
    out: dict[str, list[str]] = {}
    d = INICIO
    while d < FIN:
        if d.weekday() < 5:
            lunes = d - timedelta(days=d.weekday())
            out.setdefault(lunes.isoformat(), []).append(d.isoformat())
        d += timedelta(days=1)
    return out


def cargar_semanas(filtro: str | None) -> list[dict]:
    archivos = sorted(SEMANAS.glob("s*.json"))
    if filtro:
        archivos = [a for a in archivos if a.stem == filtro]
        if not archivos:
            sys.exit(f"No existe content/semanas/{filtro}.json")
    semanas = []
    for a in archivos:
        try:
            semanas.append(json.loads(a.read_text(encoding="utf-8")))
        except json.JSONDecodeError as e:
            sys.exit(f"{a.name}: JSON inválido: {e}")
    return semanas


def validar(semanas: list[dict], completo: bool) -> Informe:
    inf = Informe()
    ids: set[str] = set()
    for s in semanas:
        for d in s.get("days", []):
            if d.get("date") in FESTIVOS and d.get("kind") != FESTIVOS[d["date"]]:
                inf.error(d["date"], f"debe ser kind {FESTIVOS[d['date']]}")
            validar_dia(inf, d, ids)
        validar_entregable(inf, s, ids)
    if completo:
        fechas = sorted(d["date"] for s in semanas for d in s["days"])
        esperadas = sorted(f for fs in fechas_esperadas().values() for f in fs if f != "2026-12-30")
        if fechas != esperadas:
            faltan = set(esperadas) - set(fechas)
            sobran = set(fechas) - set(esperadas)
            inf.error("plan", f"fechas incorrectas. Faltan: {sorted(faltan)} Sobran: {sorted(sobran)}")
    return inf


def limpiar(obj):
    if isinstance(obj, dict):
        return {k: limpiar(v) for k, v in obj.items() if not k.startswith("_") and k != "noRun"}
    if isinstance(obj, list):
        return [limpiar(x) for x in obj]
    return obj


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in ("validar", "construir"):
        sys.exit(__doc__)
    filtro = sys.argv[2] if len(sys.argv) > 2 else None
    semanas = cargar_semanas(filtro)
    construir = sys.argv[1] == "construir"
    inf = validar(semanas, completo=construir)
    for a in inf.avisos:
        print(a)
    for e in inf.errores:
        print(e)
    n_dias = sum(1 for s in semanas for d in s["days"] if d.get("kind") == "workshop")
    n_ej = sum(len(d.get("exercises", [])) for s in semanas for d in s["days"]) + sum(len((s.get("deliverable") or {}).get("exercises", [])) for s in semanas)
    print(f"\n{len(semanas)} semana(s), {n_dias} talleres, {n_ej} ejercicios SQL: {len(inf.errores)} errores, {len(inf.avisos)} avisos.")
    if filtro and not construir:
        for s in semanas:
            for d in s["days"]:
                for ej in d.get("exercises", []):
                    print(f"\n[{ej['id']}] resultado esperado:\n{ej.get('_preview', '')}")
            for ej in (s.get("deliverable") or {}).get("exercises", []):
                print(f"\n[{ej['id']}] resultado esperado:\n{ej.get('_preview', '')}")
    if inf.errores:
        sys.exit(1)
    if construir:
        fases = json.loads(FASES.read_text(encoding="utf-8"))
        plan = {"phases": fases, "weeks": limpiar(semanas)}
        SALIDA.write_text(json.dumps(plan, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"→ {SALIDA.relative_to(RAIZ)} ({SALIDA.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
