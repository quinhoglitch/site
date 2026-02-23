# 🎬 STREAMIX — Plataforma de Streaming Local

Uma plataforma de streaming estilo Netflix/YouTube para seus vídeos locais.

---

## 🚀 Como Usar

### 1. Instalar dependências
```bash
npm install
```

### 2. Organizar seus vídeos

Coloque seus vídeos na pasta `/videos` seguindo esta estrutura:

```
videos/
├── Breaking Bad/
│   ├── poster.jpg          ← thumbnail da série (opcional)
│   ├── Temporada 1/
│   │   ├── Episodio 01.mp4
│   │   ├── Episodio 02.mp4
│   │   └── Episodio 03.mp4
│   └── Temporada 2/
│       ├── Episodio 01.mp4
│       └── Episodio 02.mp4
│
├── The Office/
│   ├── cover.jpg
│   ├── Season 1/
│   │   ├── E01 - Pilot.mp4
│   │   └── E02 - Diversity Day.mp4
│   └── Season 2/
│       └── Episode 01.mp4
│
└── Minhas Gravações/        ← sem temporadas também funciona!
    ├── thumbnail.jpg
    ├── Parte 1.mp4
    └── Parte 2.mp4
```

### 3. Iniciar o servidor
```bash
npm start
```

### 4. Abrir no navegador
```
http://localhost:3000
```

---

## 🖼 Thumbnails

O sistema detecta automaticamente imagens com estes nomes (na pasta da série ou episódio):
- `poster.jpg / poster.png`
- `thumbnail.jpg / thumbnail.png`
- `cover.jpg / cover.png`
- `[nome-do-arquivo].jpg` (mesmo nome do vídeo)

---

## 🎯 Formatos de vídeo suportados

`.mp4` `.mkv` `.avi` `.mov` `.webm` `.m4v`

> **Dica:** Para melhor compatibilidade no navegador, use `.mp4` com codec H.264.

---

## ✨ Funcionalidades

- ✅ Leitura automática de pastas
- ✅ Detecção de séries, temporadas e episódios
- ✅ Interface dark mode estilo Netflix
- ✅ Hero animado com rotação automática
- ✅ Grid responsivo com hover animado
- ✅ Player HTML5 embutido
- ✅ Navegação entre episódios (Anterior / Próximo)
- ✅ Autoplay do próximo episódio
- ✅ Barra de pesquisa em tempo real
- ✅ Salvamento de progresso (localStorage)
- ✅ Indicador visual de episódios assistidos
- ✅ Responsivo (mobile + desktop)

---

## 🛠 Tecnologias

- **Backend:** Node.js + Express
- **Frontend:** HTML5 + CSS3 + JavaScript Vanilla
- **Fontes:** Bebas Neue + DM Sans (Google Fonts)
