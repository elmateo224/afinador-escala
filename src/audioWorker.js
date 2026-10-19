// Algoritmo de Autocorrelación para detectar la frecuencia fundamental (F0)
function autoCorrelate(buffer, sampleRate) {
  const SIZE = buffer.length;
  let rms = 0;

  // 1. Calcular el valor RMS (energía/volumen de la señal)
  for (let i = 0; i < SIZE; i++) {
    const val = buffer[i];
    rms += val * val;
  }
  rms = Math.sqrt(rms / SIZE);

  // Si hay silencio / muy bajo volumen, no procesar
  if (rms < 0.01) return -1;

  // 2. Recortar la señal
  let r1 = 0, r2 = SIZE - 1;
  const threshold = 0.2;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buffer[i]) < threshold) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buffer[SIZE - i]) < threshold) {
      r2 = SIZE - i;
      break;
    }
  }

  const trimmedBuffer = buffer.slice(r1, r2);
  const newSize = trimmedBuffer.length;

  // 3. Autocorrelación
  const c = new Array(newSize).fill(0);
  for (let i = 0; i < newSize; i++) {
    for (let j = 0; j < newSize - i; j++) {
      c[i] = c[i] + trimmedBuffer[j] * trimmedBuffer[j + i];
    }
  }

  // 4. Buscar el pico principal
  let d = 0;
  while (c[d] > c[d + 1]) d++;
  let maxval = -1, maxpos = -1;
  for (let i = d; i < newSize; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  }

  let T0 = maxpos;

  // Interpolación parabólica para precisión
  const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) T0 = T0 - b / (2 * a);

  return sampleRate / T0;
}

// Escuchar los mensajes provenientes de React
self.onmessage = function (e) {
  const { buffer, sampleRate } = e.data;
  const frequency = autoCorrelate(buffer, sampleRate);
  self.postMessage({ frequency });
};