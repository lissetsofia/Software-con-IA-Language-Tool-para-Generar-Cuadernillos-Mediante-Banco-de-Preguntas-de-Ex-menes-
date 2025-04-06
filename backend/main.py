import tkinter as tk

ventana = tk.Tk()
ventana.title("Mi proyecto fino")
ventana.geometry("300x150")

etiqueta = tk.Label(ventana, text="Hola equipo de los tilines !")
etiqueta.pack(pady=10)

boton = tk.Button(ventana, text="Cerrar", command=ventana.destroy)
boton.pack()

ventana.mainloop()