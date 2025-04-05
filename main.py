import tkinter as tk

ventana = tk.Tk()
ventana.title("Mi proyecto colaborativo")
ventana.geometry("300x150")

etiqueta = tk.Label(ventana, text="Hola equipo de GitHub!")
etiqueta.pack(pady=10)

boton = tk.Button(ventana, text="Cerrar", command=ventana.destroy)
boton.pack()

ventana.mainloop()