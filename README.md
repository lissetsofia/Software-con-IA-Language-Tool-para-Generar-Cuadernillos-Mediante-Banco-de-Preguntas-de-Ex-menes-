# EVALUNIA

![EVALUNIA Banner](docs/screenshots/banner.png)

### Software de escritorio con IA local para la generación de cuadernillos de preguntas

EVALUNIA es un software de escritorio desarrollado para apoyar la generación de cuadernillos de preguntas para exámenes de admisión. Permite importar exámenes en formato Word, organizar preguntas por curso o tema, generar grupos de evaluación, aleatorizar alternativas de respuesta y exportar cuadernillos en formato Word o PDF.

Además, integra LanguageTool de forma local para brindar sugerencias de corrección y adecuación lingüística, considerando aspectos como ortografía, signos de puntuación y adecuación léxica.

---

## Tecnologías utilizadas

![Electron](https://img.shields.io/badge/Electron-Desktop-47848F?style=for-the-badge&logo=electron&logoColor=white)
![Python](https://img.shields.io/badge/Python-Backend-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-API-000000?style=for-the-badge&logo=flask&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-Database-003B57?style=for-the-badge&logo=sqlite&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-Frontend-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![HTML](https://img.shields.io/badge/HTML-Interface-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS-Styles-1572B6?style=for-the-badge&logo=css3&logoColor=white)

---

## Tabla de contenidos

- [Características principales](#características-principales)
- [Módulos del sistema](#módulos-del-sistema)
- [Arquitectura general](#arquitectura-general)
- [Requisitos del sistema](#requisitos-del-sistema)
- [Instalación para desarrollo](#instalación-para-desarrollo)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Capturas del sistema](#capturas-del-sistema)
- [Estado del proyecto](#estado-del-proyecto)
- [Créditos](#créditos)

---

## Características principales

- Importación de exámenes en formato Word.
- División y organización de preguntas por curso o tema.
- Registro y gestión de grupos de evaluación.
- Generación de cuadernillos de preguntas.
- Aleatorización de alternativas de respuesta.
- Generación de claves de respuesta.
- Exportación de cuadernillos en formato Word y PDF.
- Banco de preguntas configurable y escalable.
- Sugerencias de corrección y adecuación lingüística mediante LanguageTool local.
- Procesamiento de documentos DOCX y PDF.
- Interfaz de escritorio desarrollada con Electron.

---

## Módulos del sistema

### Cuadernillos

Permite importar exámenes, organizar preguntas, asignar temas y generar cuadernillos por grupos de evaluación.

### Banco de preguntas

Permite almacenar, organizar y reutilizar preguntas para la generación de nuevos cuadernillos.

### Sugerencias de corrección y adecuación lingüística

Utiliza LanguageTool de forma local para analizar textos y generar sugerencias relacionadas con ortografía, puntuación y adecuación léxica.


---

## Arquitectura general

EVALUNIA utiliza una arquitectura local compuesta por:

- **Frontend:** Electron, HTML, CSS, JavaScript y Bootstrap.
- **Backend:** Python con Flask.
- **Base de datos:** SQLite.
- **Procesamiento lingüístico:** LanguageTool ejecutado localmente.
- **Procesamiento documental:** manejo de archivos Word y PDF.

```txt
Usuario
  │
  ▼
Interfaz Electron
  │
  ▼
Backend Flask
  │
  ├── Base de datos SQLite
  ├── Procesamiento de documentos Word/PDF
  └── LanguageTool local
