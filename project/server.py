# -*- coding: utf-8 -*-
"""
Калькулятор стоимости каркасного дома — локальное приложение.

Работает без интернета и без сторонних библиотек (только стандартная
библиотека Python 3). Данные берутся из таблицы .xlsx, которая лежит
рядом, в папке "Данные".

Запуск: двойной клик по файлу "запуск.bat".
Сервер поднимается на http://127.0.0.1:8765/ и открывает браузер.
"""

import csv
import io
import json
import os
import sys
import threading
import urllib.request
import webbrowser
import zipfile
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

if getattr(sys, "frozen", False):
    # собрано в .exe: ресурсы лежат в _internal, данные — рядом с .exe
    APP_DIR = os.path.dirname(sys.executable)
    RES_DIR = getattr(sys, "_MEIPASS", APP_DIR)
else:
    APP_DIR = RES_DIR = os.path.dirname(os.path.abspath(__file__))

DATA_DIR = os.path.join(APP_DIR, "Данные")
if not os.path.isdir(DATA_DIR):
    _src = os.path.join(RES_DIR, "Данные")
    if os.path.isdir(_src) and os.path.abspath(_src) != os.path.abspath(DATA_DIR):
        try:
            import shutil
            shutil.copytree(_src, DATA_DIR)
        except Exception:  # noqa: BLE001
            DATA_DIR = _src
    else:
        DATA_DIR = _src
WORKBOOK_NAME = "Прайс_каркасный_дом_2026_рабочий.xlsx"
ONLINE_CACHE = os.path.join(DATA_DIR, "Прайс_каркасный_дом_2026_онлайн.xlsx")


def pick_workbook(data_dir, name=WORKBOOK_NAME):
    """Основная таблица, а если её нет — любой прайс .xlsx из папки «Данные».

    Благодаря этому приложение запускается и без прайса с реальными ценами:
    оно открывает пример таблицы из репозитория.
    """
    primary = os.path.join(data_dir, name)
    if os.path.exists(primary):
        return primary
    try:
        for f in sorted(os.listdir(data_dir)):
            low = f.lower()
            if low.endswith(".xlsx") and not low.startswith("~$") and "онлайн" not in low:
                return os.path.join(data_dir, f)
    except OSError:
        pass
    return primary


WORKBOOK = pick_workbook(DATA_DIR)
HOST = "127.0.0.1"
PORT = int(os.environ.get("KALK_PORT", "8791"))

NS = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


# --------------------------------------------------------------------------
# Чтение .xlsx средствами стандартной библиотеки
# --------------------------------------------------------------------------
def _col_index(ref):
    letters = "".join(ch for ch in ref if ch.isalpha())
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch.upper()) - 64)
    return n - 1


def read_xlsx(path):
    """Возвращает {имя_листа: [[строка, ...], ...]}."""
    with zipfile.ZipFile(path) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in root.findall("a:si", NS):
                shared.append("".join(t.text or "" for t in si.iter(
                    "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")))

        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        rel_map = {r.get("Id"): r.get("Target") for r in rels}
        sheets = []
        for sh in wb.find("a:sheets", NS):
            rid = sh.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
            target = (rel_map.get(rid) or "").lstrip("/")
            if target and not target.startswith("xl/"):
                target = "xl/" + target
            sheets.append((sh.get("name"), target))

        result = {}
        for name, target in sheets:
            if target not in z.namelist():
                continue
            root = ET.fromstring(z.read(target))
            rows = []
            for row in root.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row"):
                values = {}
                for c in row.findall("a:c", NS):
                    idx = _col_index(c.get("r", "A1"))
                    t = c.get("t")
                    v = c.find("a:v", NS)
                    isv = c.find("a:is", NS)
                    if t == "s" and v is not None:
                        val = shared[int(v.text)]
                    elif t == "inlineStr" and isv is not None:
                        val = "".join(x.text or "" for x in isv.iter(
                            "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t"))
                    elif v is not None:
                        txt = v.text
                        try:
                            val = float(txt)
                            if val.is_integer():
                                val = int(val)
                        except (TypeError, ValueError):
                            val = txt
                    else:
                        val = ""
                    values[idx] = val
                width = (max(values) + 1) if values else 0
                rows.append([values.get(i, "") for i in range(width)])
            result[name] = rows
        return result


def _num(value):
    """Число из ячейки; если в ней текст (например, «цена скрыта») — 0."""
    if value is None or isinstance(value, bool):
        return 0
    if isinstance(value, (int, float)):
        return value
    text = str(value).strip().replace("\u00a0", "").replace(" ", "").replace(",", ".")
    if not text:
        return 0
    try:
        number = float(text)
    except ValueError:
        return 0
    return int(number) if number.is_integer() else number


def load_items(path):
    """Превращает лист 'Справочник затрат' в список позиций."""
    book = read_xlsx(path)
    rows = book.get("Справочник затрат") or next(iter(book.values()), [])
    if not rows:
        return []
    header = [str(h).strip() for h in rows[0]]
    pos = {name: i for i, name in enumerate(header)}

    def get(row, name, default=""):
        i = pos.get(name)
        if i is None or i >= len(row):
            return default
        return row[i]

    items = []
    for row in rows[1:]:
        if not row or get(row, "ID") == "":
            continue
        items.append({
            "id": get(row, "ID"),
            "section": str(get(row, "Раздел")),
            "subsection": str(get(row, "Подраздел")),
            "name": str(get(row, "Наименование позиции")),
            "type": str(get(row, "Тип позиции")),
            "unit": str(get(row, "Единица измерения")),
            "min": _num(get(row, "Минимальная цена, ₽", 0)),
            "base": _num(get(row, "Базовая цена, ₽", 0)),
            "max": _num(get(row, "Максимальная цена, ₽", 0)),
            "status": str(get(row, "Статус")),
            "basis": str(get(row, "Основание цены")),
            "comment": str(get(row, "Комментарий")),
        })
    return items


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------
def read_bytes(path):
    with open(path, "rb") as f:
        return f.read()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, ctype, body):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, code=200):
        self._send(code, "application/json; charset=utf-8",
                   json.dumps(obj, ensure_ascii=False).encode("utf-8"))

    def do_GET(self):
        p = self.path.split("?")[0]
        if p in ("/", "/index.html"):
            return self._send(200, "text/html; charset=utf-8", read_bytes(os.path.join(RES_DIR, "index.html")))
        if p == "/style.css":
            return self._send(200, "text/css; charset=utf-8", read_bytes(os.path.join(RES_DIR, "style.css")))
        if p == "/app.js":
            return self._send(200, "application/javascript; charset=utf-8", read_bytes(os.path.join(RES_DIR, "app.js")))
        if p == "/api/data":
            source = ONLINE_CACHE if os.path.exists(ONLINE_CACHE) else WORKBOOK
            try:
                items = load_items(source)
                return self._json({"ok": True, "items": items,
                                   "source": os.path.basename(source),
                                   "online": source == ONLINE_CACHE})
            except Exception as e:  # noqa: BLE001
                return self._json({"ok": False, "error": str(e)}, 500)
        if p == "/api/update":
            return self._online_update()
        if p == "/api/quit":
            self._json({"ok": True})
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return
        return self._send(404, "text/plain; charset=utf-8", b"not found")

    def _online_update(self):
        """Скачивает онлайн-таблицу по ссылке и кэширует её локально."""
        import urllib.parse
        q = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(q)
        url = (params.get("url") or [""])[0]
        if not url:
            return self._json({"ok": False, "error": "Не передана ссылка на таблицу."}, 400)
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                raw = r.read()
            with open(ONLINE_CACHE, "wb") as f:
                f.write(raw)
            items = load_items(ONLINE_CACHE)
            return self._json({"ok": True, "items": items,
                               "source": os.path.basename(ONLINE_CACHE),
                               "online": True, "bytes": len(raw)})
        except Exception as e:  # noqa: BLE001
            return self._json({"ok": False, "error": str(e)}, 502)

    def do_POST(self):
        route = self.path.split("?")[0]
        if route == "/api/load":
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) or b""
            try:
                tmp = os.path.join(DATA_DIR, "Прайс_загруженный_вручную.xlsx")
                with open(tmp, "wb") as f:
                    f.write(raw)
                items = load_items(tmp)
                return self._json({"ok": True, "items": items,
                                   "source": "Прайс_загруженный_вручную.xlsx",
                                   "online": False, "bytes": len(raw)})
            except Exception as e:  # noqa: BLE001
                return self._json({"ok": False, "error": "Не удалось прочитать таблицу: %s" % e}, 400)
        if route != "/api/export":
            return self._send(404, "text/plain; charset=utf-8", b"not found")
        length = int(self.headers.get("Content-Length", 0))
        payload = json.loads(self.rfile.read(length) or b"{}")
        buf = io.StringIO()
        w = csv.writer(buf, delimiter=";")
        w.writerow(["Раздел", "Позиция", "Ед.", "Кол-во", "Цена", "Сумма"])
        for r in payload.get("rows", []):
            w.writerow([r.get("section", ""), r.get("name", ""), r.get("unit", ""),
                        r.get("qty", ""), r.get("price", ""), r.get("sum", "")])
        w.writerow([])
        w.writerow(["", "", "", "", "Итого:", payload.get("total", "")])
        w.writerow(["", "", "", "", "Цена за м²:", payload.get("perM2", "")])
        data = ("\ufeff" + buf.getvalue()).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Content-Disposition", "attachment; filename=raschet_karkasnyy_dom.csv")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main():
    if not os.path.exists(WORKBOOK):
        print("Не найден файл с данными:", WORKBOOK)
        print("Положите прайс .xlsx в папку 'Данные'.")
        input("Enter для выхода...")
        return
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    url = f"http://{HOST}:{PORT}/"
    print("Данные:", os.path.basename(WORKBOOK))
    print("Калькулятор стоимости каркасного дома запущен:", url)
    print("Чтобы закрыть приложение, закройте это окно.")
    try:
        webbrowser.open(url)
    except Exception:  # noqa: BLE001
        pass
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
