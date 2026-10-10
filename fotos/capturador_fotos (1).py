"""Captura fotografies de la pantalla, redreça-les i desa-les per carpetes.

Instal·lació: pip install pillow opencv-python numpy
Execució: python capturador_fotos.py
"""

import ctypes
import sys
from datetime import datetime
from pathlib import Path
import tkinter as tk
from tkinter import messagebox, simpledialog, ttk

import cv2
import numpy as np
from PIL import Image, ImageGrab, ImageTk


BASE_DIR = Path(__file__).resolve().parent
POINT_LABELS = ("1. Cantonada superior esquerra", "2. Cantonada superior dreta", "3. Cantonada inferior dreta")


def enable_dpi_awareness():
    if sys.platform == "win32":
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(2)
        except (AttributeError, OSError):
            try:
                ctypes.windll.user32.SetProcessDPIAware()
            except (AttributeError, OSError):
                pass


def straighten(image, points):
    """Transformació afí amb 3 punts: corregeix rotació i inclinació/paral·lelisme."""
    tl, tr, br = [np.array(p, dtype=np.float32) for p in points]
    width = int(round(np.linalg.norm(tr - tl)))
    height = int(round(np.linalg.norm(br - tr)))
    if width < 10 or height < 10:
        raise ValueError("La selecció és massa petita. Marca les tres cantonades de nou.")
    if width * height > 80_000_000:
        raise ValueError("La selecció és massa gran. Torna a marcar les cantonades.")
    src = np.float32([tl, tr, br])
    dst = np.float32([[0, 0], [width - 1, 0], [width - 1, height - 1]])
    transform = cv2.getAffineTransform(src, dst)
    rgb = np.array(image.convert("RGB"))
    result = cv2.warpAffine(rgb, transform, (width, height), flags=cv2.INTER_CUBIC,
                            borderMode=cv2.BORDER_REPLICATE)
    return Image.fromarray(result)


class PhotoCaptureApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Capturador de fotos · 3 cantonades")
        self.root.geometry("1150x800")
        self.root.minsize(760, 550)
        self.raw_image = None
        self.output_image = None
        self.tk_image = None
        self.points = []
        self.mode = "idle"
        self.display_rect = (0, 0, 1, 1)
        self._folders = []

        header = ttk.Frame(root, padding=10)
        header.pack(fill="x")
        ttk.Button(header, text="📷 Nova captura de pantalla", command=self.capture).pack(side="left", padx=(0, 8))
        ttk.Button(header, text="↩ Desfer últim punt", command=self.undo).pack(side="left", padx=(0, 8))
        ttk.Button(header, text="🔁 Tornar a marcar", command=self.reset_points).pack(side="left", padx=(0, 8))
        ttk.Button(header, text="↻ Actualitzar carpetes", command=self.refresh_folders).pack(side="left")

        self.status = tk.StringVar(value="Prem «Nova captura de pantalla» per començar.")
        ttk.Label(root, textvariable=self.status, padding=(12, 6), wraplength=1100).pack(fill="x")

        self.canvas = tk.Canvas(root, bg="#242a31", highlightthickness=0, cursor="crosshair")
        self.canvas.pack(fill="both", expand=True, padx=10, pady=(2, 6))
        self.canvas.bind("<Button-1>", self.click_canvas)
        self.canvas.bind("<Configure>", lambda _event: self.render())

        bottom = ttk.Frame(root, padding=(10, 2, 10, 10))
        bottom.pack(fill="x")
        ttk.Label(bottom, text="DESAR A UNA CARPETA (un clic):").pack(anchor="w")
        self.folder_frame = ttk.Frame(bottom)
        self.folder_frame.pack(fill="x", pady=(6, 2))
        ttk.Button(bottom, text="+ Crear carpeta", command=self.create_folder).pack(anchor="w", pady=(4, 0))
        self.refresh_folders()

    def capture(self):
        # Amaga la finestra perquè no aparegui a la captura.
        self.root.withdraw()
        self.root.after(350, self._capture_now)

    def _capture_now(self):
        try:
            self.raw_image = ImageGrab.grab().convert("RGB")
            self.output_image = None
            self.points = []
            self.mode = "select"
            self.status.set("Marca el punt 1/3: cantonada SUPERIOR ESQUERRA.")
        except Exception as error:
            messagebox.showerror("Error de captura", str(error), parent=self.root)
        finally:
            self.root.deiconify()
            self.root.lift()
            self.render()

    def click_canvas(self, event):
        if self.mode != "select" or self.raw_image is None or len(self.points) >= 3:
            return
        x0, y0, shown_w, shown_h = self.display_rect
        if not (x0 <= event.x < x0 + shown_w and y0 <= event.y < y0 + shown_h):
            return
        ix = (event.x - x0) * self.raw_image.width / shown_w
        iy = (event.y - y0) * self.raw_image.height / shown_h
        self.points.append((ix, iy))
        if len(self.points) == 3:
            try:
                self.output_image = straighten(self.raw_image, self.points)
                self.mode = "preview"
                self.status.set(f"Foto redreçada: {self.output_image.width} × {self.output_image.height} px. Fes clic a una carpeta per desar-la.")
            except ValueError as error:
                self.points.clear()
                self.status.set(str(error))
                messagebox.showwarning("Selecció incorrecta", str(error), parent=self.root)
        else:
            self.status.set(f"Marca el punt {len(self.points)+1}/3: {POINT_LABELS[len(self.points)].split('. ', 1)[1]}.")
        self.render()

    def undo(self):
        if self.mode == "preview":
            self.output_image = None
            self.mode = "select"
        if self.mode == "select" and self.points:
            self.points.pop()
        if self.raw_image is not None:
            self.status.set(f"Marca el punt {len(self.points)+1}/3: {POINT_LABELS[len(self.points)].split('. ', 1)[1]}.")
        self.render()

    def reset_points(self):
        if self.raw_image is None:
            return
        self.points.clear()
        self.output_image = None
        self.mode = "select"
        self.status.set("Marca el punt 1/3: cantonada SUPERIOR ESQUERRA.")
        self.render()

    def render(self):
        self.canvas.delete("all")
        image = self.output_image if self.mode == "preview" else self.raw_image
        if image is None:
            self.canvas.create_text(max(100, self.canvas.winfo_width() // 2),
                                    max(100, self.canvas.winfo_height() // 2),
                                    text="Fes una captura per començar", fill="white", font=("Segoe UI", 20))
            return
        cw, ch = max(self.canvas.winfo_width(), 1), max(self.canvas.winfo_height(), 1)
        factor = min(cw / image.width, ch / image.height)
        shown_w = max(1, round(image.width * factor))
        shown_h = max(1, round(image.height * factor))
        x0 = (cw - shown_w) // 2
        y0 = (ch - shown_h) // 2
        resized = image.resize((shown_w, shown_h), Image.Resampling.LANCZOS)
        self.tk_image = ImageTk.PhotoImage(resized, master=self.root)
        self.canvas.create_image(x0, y0, anchor="nw", image=self.tk_image)
        self.display_rect = (x0, y0, shown_w, shown_h)
        if self.mode == "select":
            pts = [(x0 + x * shown_w / self.raw_image.width,
                    y0 + y * shown_h / self.raw_image.height) for x, y in self.points]
            if len(pts) >= 2:
                self.canvas.create_line(*pts[0], *pts[1], fill="#00e0ff", width=3)
            for i, (x, y) in enumerate(pts, 1):
                r = 6
                self.canvas.create_oval(x-r, y-r, x+r, y+r, outline="white", fill="#ffcf38", width=2)
                self.canvas.create_text(x+14, y-12, text=str(i), anchor="w", fill="white", font=("Segoe UI", 13, "bold"))

    def refresh_folders(self):
        for widget in self.folder_frame.winfo_children():
            widget.destroy()
        self._folders = sorted((p for p in BASE_DIR.iterdir() if p.is_dir() and not p.name.startswith(".")),
                               key=lambda p: p.name.casefold())
        if not self._folders:
            ttk.Label(self.folder_frame, text="No hi ha carpetes al costat del .py. Crea'n una amb el botó inferior.").pack(anchor="w")
        destinations = []
        for folder in self._folders:
            if folder.name.casefold() == "conjuntes":
                destinations.append(("📁 Conjunta ae", folder, "ae"))
                destinations.append(("📁 Conjunta ea", folder, "ea"))
            else:
                destinations.append((f"📁 {folder.name}", folder, "foto_"))
        for col, (label, folder, prefix) in enumerate(destinations):
            button = ttk.Button(self.folder_frame, text=label,
                                command=lambda f=folder, p=prefix: self.save_to(f, p))
            button.grid(row=col // 5, column=col % 5, sticky="ew", padx=(0, 7), pady=(0, 5))
        for col in range(5):
            self.folder_frame.columnconfigure(col, weight=1)

    def create_folder(self):
        name = simpledialog.askstring("Crear carpeta", "Nom de la carpeta nova:", parent=self.root)
        if not name:
            return
        name = name.strip()
        if name in {".", ".."} or any(c in name for c in '<>:"/\\|?*') or name.endswith((" ", ".")):
            messagebox.showerror("Nom incorrecte", "Introdueix un nom de carpeta vàlid.", parent=self.root)
            return
        try:
            (BASE_DIR / name).mkdir(exist_ok=True)
            self.refresh_folders()
        except OSError as error:
            messagebox.showerror("No s'ha pogut crear", str(error), parent=self.root)

    def save_to(self, folder, prefix="foto_"):
        if self.output_image is None:
            messagebox.showinfo("Primer selecciona la foto", "Fes una captura i marca les tres cantonades abans de desar-la.", parent=self.root)
            return
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        filepath = folder / f"{prefix}{timestamp}.jpg"
        try:
            self.output_image.save(filepath, "JPEG", quality=96, subsampling=0)
        except OSError as error:
            messagebox.showerror("Error en desar", str(error), parent=self.root)
            return
        self.status.set(f"✓ Desada a «{folder.name}»: {filepath.name}. Prem «Nova captura» per fer-ne una altra.")
        # S'ha desat; evitem duplicacions accidentals fins a la captura següent.
        self.output_image = None
        self.mode = "saved"


if __name__ == "__main__":
    enable_dpi_awareness()
    root = tk.Tk()
    PhotoCaptureApp(root)
    root.mainloop()
