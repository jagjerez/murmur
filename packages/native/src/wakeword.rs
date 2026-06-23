//! Lógica testeable del wake word ("hey murmur") de murmur.
//!
//! Aquí vive sólo la parte **determinista y sin hardware** del pipeline de detección:
//!
//! - [`RingBuffer`]: búfer circular de muestras de audio (`i16`) de capacidad fija, para
//!   mantener una ventana deslizante de los últimos frames sin reasignar memoria.
//! - [`frame_energy`]: energía RMS de un frame, usada como puerta de "hay voz / silencio".
//! - [`normalize_phrase`]: normaliza la frase de activación (minúsculas / trim / colapso de
//!   espacios) para comparar de forma estable lo que dijo el usuario con la frase configurada.
//! - [`WakeWordGate`]: dado un `score` (probabilidad de coincidencia, inyectado por el modelo
//!   acústico real) y la energía del frame, decide si **dispara** la activación.
//!
//! El **modelo acústico real** (openWakeWord/porcupine) que produce el `score` es un binario/
//! modelo nativo fuera del pipeline de este crate (ver [`acoustic_score_stub`]): aquí sólo
//! exponemos el enchufe (`score`) y la lógica de decisión, que sí se cubre con `cargo test`.

/// Energía RMS por debajo de la cual se considera silencio (no se dispara aunque el score sea
/// alto). Valor en la escala de muestras `i16` normalizadas a `[-1.0, 1.0]`.
pub const DEFAULT_ENERGY_THRESHOLD: f32 = 0.01;

/// Búfer circular de muestras de audio de capacidad fija.
///
/// `push` añade una muestra; al llegar a capacidad sobrescribe la más antigua (wrap-around).
/// `iter` recorre las muestras en orden cronológico (de la más antigua a la más reciente).
#[derive(Debug, Clone)]
pub struct RingBuffer {
    data: Vec<i16>,
    capacity: usize,
    /// Índice donde se escribirá la próxima muestra.
    head: usize,
    /// Número de muestras válidas (≤ capacity).
    len: usize,
}

impl RingBuffer {
    /// Crea un búfer con la capacidad dada. Una capacidad 0 hace que `push` sea no-op.
    pub fn new(capacity: usize) -> Self {
        RingBuffer {
            data: vec![0; capacity],
            capacity,
            head: 0,
            len: 0,
        }
    }

    /// Capacidad máxima (fija) del búfer.
    pub fn capacity(&self) -> usize {
        self.capacity
    }

    /// Número de muestras almacenadas actualmente.
    pub fn len(&self) -> usize {
        self.len
    }

    /// `true` si no hay muestras almacenadas.
    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    /// `true` si el búfer está lleno (`len == capacity`).
    pub fn is_full(&self) -> bool {
        self.capacity != 0 && self.len == self.capacity
    }

    /// Añade una muestra. Si el búfer está lleno, sobrescribe la más antigua.
    pub fn push(&mut self, sample: i16) {
        if self.capacity == 0 {
            return;
        }
        self.data[self.head] = sample;
        self.head = (self.head + 1) % self.capacity;
        if self.len < self.capacity {
            self.len += 1;
        }
    }

    /// Añade un frame completo de muestras (en orden), aplicando el wrap-around por muestra.
    pub fn extend(&mut self, frame: &[i16]) {
        for &sample in frame {
            self.push(sample);
        }
    }

    /// Itera las muestras en orden cronológico (de la más antigua a la más reciente).
    pub fn iter(&self) -> impl Iterator<Item = i16> + '_ {
        let start = if self.len == self.capacity {
            self.head
        } else {
            // Aún no ha dado la vuelta: la más antigua está en 0.
            0
        };
        (0..self.len).map(move |i| self.data[(start + i) % self.capacity])
    }

    /// Copia las muestras (en orden cronológico) a un `Vec`.
    pub fn to_vec(&self) -> Vec<i16> {
        self.iter().collect()
    }
}

/// Energía RMS (root-mean-square) de un frame de muestras `i16`, normalizada a `[0.0, ~1.0]`.
///
/// Las muestras se normalizan dividiendo por [`i16::MAX`]; el resultado es la raíz de la media
/// de los cuadrados. Un frame vacío tiene energía `0.0`. Sirve como puerta de silencio.
pub fn frame_energy(frame: &[i16]) -> f32 {
    if frame.is_empty() {
        return 0.0;
    }
    let scale = f32::from(i16::MAX);
    let sum_sq: f32 = frame
        .iter()
        .map(|&s| {
            let v = f32::from(s) / scale;
            v * v
        })
        .sum();
    (sum_sq / frame.len() as f32).sqrt()
}

/// Normaliza la frase de activación para una comparación estable:
/// minúsculas, sin espacios al inicio/fin, y espacios internos colapsados a uno solo.
///
/// Ej.: `"  Hey   Murmur  "` → `"hey murmur"`.
pub fn normalize_phrase(phrase: &str) -> String {
    phrase
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Puerta de decisión del wake word.
///
/// Combina dos señales: el `score` del modelo acústico (probabilidad de que el audio
/// contenga la frase, `0.0..=1.0`) y la energía del frame. Dispara la activación sólo si el
/// score alcanza la `sensitivity` **y** hay suficiente energía (no es silencio). Esto evita
/// falsos positivos en silencio cuando el modelo devuelve ruido.
#[derive(Debug, Clone, Copy)]
pub struct WakeWordGate {
    /// Umbral de score `0.0..=1.0` a partir del cual se considera coincidencia.
    pub sensitivity: f32,
    /// Energía mínima del frame para considerar que hay voz.
    pub energy_threshold: f32,
}

impl WakeWordGate {
    /// Gate con la sensibilidad dada (sujeta a `[0.0, 1.0]`) y el umbral de energía por defecto.
    pub fn new(sensitivity: f32) -> Self {
        WakeWordGate {
            sensitivity: sensitivity.clamp(0.0, 1.0),
            energy_threshold: DEFAULT_ENERGY_THRESHOLD,
        }
    }

    /// Gate con sensibilidad y umbral de energía explícitos (ambos sujetos a rango razonable).
    pub fn with_energy_threshold(sensitivity: f32, energy_threshold: f32) -> Self {
        WakeWordGate {
            sensitivity: sensitivity.clamp(0.0, 1.0),
            energy_threshold: energy_threshold.max(0.0),
        }
    }

    /// `true` si debe dispararse la activación: `score >= sensitivity` y `energy > energy_threshold`.
    pub fn evaluate(&self, score: f32, energy: f32) -> bool {
        score >= self.sensitivity && energy > self.energy_threshold
    }
}

/// Stub documentado del modelo acústico real.
///
/// En producción, el `score` lo produce un modelo/binario nativo (openWakeWord, porcupine, …)
/// alimentado con la ventana de audio del [`RingBuffer`]. Ese cableado vive **fuera** del
/// pipeline de este crate (no se ejecuta en `cargo test`). Esta función es un placeholder
/// determinista para documentar la firma esperada (`&[i16] -> f32`); siempre devuelve `0.0`.
pub fn acoustic_score_stub(_window: &[i16]) -> f32 {
    0.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ring_buffer_reports_capacity_and_len() {
        let mut rb = RingBuffer::new(3);
        assert_eq!(rb.capacity(), 3);
        assert_eq!(rb.len(), 0);
        assert!(rb.is_empty());
        rb.push(1);
        rb.push(2);
        assert_eq!(rb.len(), 2);
        assert!(!rb.is_empty());
        assert!(!rb.is_full());
        rb.push(3);
        assert!(rb.is_full());
        assert_eq!(rb.len(), 3);
    }

    #[test]
    fn ring_buffer_iterates_in_chronological_order_before_wrap() {
        let mut rb = RingBuffer::new(4);
        rb.extend(&[10, 20, 30]);
        assert_eq!(rb.to_vec(), vec![10, 20, 30]);
    }

    #[test]
    fn ring_buffer_wraps_around_overwriting_oldest() {
        let mut rb = RingBuffer::new(3);
        rb.extend(&[1, 2, 3, 4, 5]);
        // Capacidad 3: quedan las 3 más recientes en orden cronológico.
        assert_eq!(rb.len(), 3);
        assert_eq!(rb.to_vec(), vec![3, 4, 5]);
        rb.push(6);
        assert_eq!(rb.to_vec(), vec![4, 5, 6]);
    }

    #[test]
    fn ring_buffer_zero_capacity_is_noop() {
        let mut rb = RingBuffer::new(0);
        rb.push(1);
        rb.extend(&[2, 3]);
        assert_eq!(rb.len(), 0);
        assert!(rb.is_empty());
        assert!(rb.to_vec().is_empty());
    }

    #[test]
    fn frame_energy_of_empty_is_zero() {
        assert_eq!(frame_energy(&[]), 0.0);
    }

    #[test]
    fn frame_energy_of_silence_is_zero() {
        assert_eq!(frame_energy(&[0, 0, 0, 0]), 0.0);
    }

    #[test]
    fn frame_energy_of_full_scale_constant_is_near_one() {
        // Señal constante a fondo de escala → RMS ≈ 1.0.
        let frame = [i16::MAX; 8];
        let e = frame_energy(&frame);
        assert!((e - 1.0).abs() < 1e-3, "energía esperada ≈ 1.0, fue {e}");
    }

    #[test]
    fn frame_energy_of_known_signal() {
        // Mitad de fondo de escala constante → RMS ≈ 0.5.
        let half = i16::MAX / 2;
        let frame = [half; 16];
        let e = frame_energy(&frame);
        assert!((e - 0.5).abs() < 1e-2, "energía esperada ≈ 0.5, fue {e}");
    }

    #[test]
    fn frame_energy_louder_signal_has_more_energy() {
        let quiet = frame_energy(&[100, -100, 100, -100]);
        let loud = frame_energy(&[10_000, -10_000, 10_000, -10_000]);
        assert!(loud > quiet);
    }

    #[test]
    fn normalize_phrase_lowercases_and_trims() {
        assert_eq!(normalize_phrase("  Hey Murmur  "), "hey murmur");
    }

    #[test]
    fn normalize_phrase_collapses_internal_whitespace() {
        assert_eq!(normalize_phrase("Hey    Murmur"), "hey murmur");
        assert_eq!(normalize_phrase("hey\t\nmurmur"), "hey murmur");
    }

    #[test]
    fn normalize_phrase_is_idempotent() {
        let once = normalize_phrase("  HEY   murmur ");
        assert_eq!(normalize_phrase(&once), once);
    }

    #[test]
    fn normalize_phrase_empty_stays_empty() {
        assert_eq!(normalize_phrase("   "), "");
        assert_eq!(normalize_phrase(""), "");
    }

    #[test]
    fn gate_clamps_sensitivity() {
        assert_eq!(WakeWordGate::new(2.0).sensitivity, 1.0);
        assert_eq!(WakeWordGate::new(-1.0).sensitivity, 0.0);
        assert_eq!(WakeWordGate::new(0.5).sensitivity, 0.5);
    }

    #[test]
    fn gate_fires_when_score_meets_sensitivity_and_energy_high() {
        let gate = WakeWordGate::new(0.5);
        assert!(gate.evaluate(0.9, 0.2));
        // En el umbral exacto de score también dispara (>=).
        assert!(gate.evaluate(0.5, 0.2));
    }

    #[test]
    fn gate_does_not_fire_when_score_below_sensitivity() {
        let gate = WakeWordGate::new(0.7);
        assert!(!gate.evaluate(0.69, 0.5));
    }

    #[test]
    fn gate_does_not_fire_on_low_energy_even_with_high_score() {
        let gate = WakeWordGate::new(0.5);
        // Score perfecto pero energía por debajo del umbral (silencio) → no dispara.
        assert!(!gate.evaluate(1.0, 0.0));
        assert!(!gate.evaluate(1.0, DEFAULT_ENERGY_THRESHOLD));
    }

    #[test]
    fn gate_with_custom_energy_threshold() {
        let gate = WakeWordGate::with_energy_threshold(0.5, 0.3);
        assert!(!gate.evaluate(1.0, 0.25));
        assert!(gate.evaluate(1.0, 0.31));
    }

    #[test]
    fn acoustic_score_stub_is_zero() {
        // El stub no produce coincidencias: el modelo real va fuera del pipeline.
        assert_eq!(acoustic_score_stub(&[1, 2, 3]), 0.0);
        // Con el stub, el gate nunca dispara (salvo sensitivity 0, que es no recomendable).
        let gate = WakeWordGate::new(0.5);
        let window = [i16::MAX; 16];
        assert!(!gate.evaluate(acoustic_score_stub(&window), frame_energy(&window)));
    }
}
