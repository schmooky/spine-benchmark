- Blend Mode вызывают дополнительные flush-ы шейдеров при рендере и создают высокую нагрузку
- Использование Add и Mul режимов лучше минимизировать или сводить на ноль для снижения температурной нагрузки
- Нужно использовать не более двух аттачментов с аддитивным режимом на анимацию
- Режимы наложения можно использовать только в анонсерах и специальных символах (скаттер, вайлд)
- Текстурный атлас снижает число переключений текстур в рендере, однако бленды делают ровно противоположное