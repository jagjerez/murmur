//! Helpers nativos de murmur (hotkeys globales, audio nativo). Esqueleto para Fase 3+.

pub mod accelerator;
pub mod wakeword;

/// Identificador del crate. Placeholder hasta que aterricen las funciones nativas.
pub fn package_name() -> &'static str {
    "murmur-native"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposes_package_name() {
        assert_eq!(package_name(), "murmur-native");
    }
}
