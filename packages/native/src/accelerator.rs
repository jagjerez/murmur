//! Parser/validador/normalizador de aceleradores de teclado al estilo Tauri/Electron.
//!
//! Formato: `"CommandOrControl+Shift+Space"`. Los modificadores son case-insensitive y se
//! normalizan a una forma canónica; debe haber siempre una tecla final. Reglas idénticas a las
//! del parser TS en `@murmur/core` (mantener sincronizadas).

use std::fmt;

/// Modificador de un acelerador, en su forma canónica.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Modifier {
    /// `CommandOrControl` / `CmdOrCtrl`: Cmd en macOS, Ctrl en el resto.
    CommandOrControl,
    /// `Control` / `Ctrl`.
    Control,
    /// `Alt` / `Option`.
    Alt,
    /// `Shift`.
    Shift,
    /// `Super` / `Meta`.
    Super,
}

impl Modifier {
    /// Forma canónica del modificador como cadena.
    fn canonical(self) -> &'static str {
        match self {
            Modifier::CommandOrControl => "CommandOrControl",
            Modifier::Control => "Control",
            Modifier::Alt => "Alt",
            Modifier::Shift => "Shift",
            Modifier::Super => "Super",
        }
    }

    /// Orden canónico (estable) de los modificadores en la forma `to_string`.
    fn order(self) -> u8 {
        match self {
            Modifier::CommandOrControl => 0,
            Modifier::Control => 1,
            Modifier::Alt => 2,
            Modifier::Shift => 3,
            Modifier::Super => 4,
        }
    }

    /// Intenta reconocer un token (case-insensitive) como modificador.
    fn from_token(token: &str) -> Option<Modifier> {
        match token.to_ascii_lowercase().as_str() {
            "commandorcontrol" | "cmdorctrl" => Some(Modifier::CommandOrControl),
            "control" | "ctrl" => Some(Modifier::Control),
            "alt" | "option" => Some(Modifier::Alt),
            "shift" => Some(Modifier::Shift),
            "super" | "meta" => Some(Modifier::Super),
            _ => None,
        }
    }
}

/// Acelerador parseado y normalizado: lista de modificadores (orden canónico) + tecla.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Accelerator {
    pub mods: Vec<Modifier>,
    pub key: String,
}

/// Error de parseo de un acelerador.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AcceleratorError {
    /// Cadena vacía o solo separadores.
    Empty,
    /// Falta la tecla final (p. ej. `"Shift+"`).
    MissingKey,
    /// Token de modificador desconocido (no es modificador y no está en posición de tecla).
    UnknownModifier(String),
    /// Modificador repetido (p. ej. `"Ctrl+Ctrl+A"`).
    DuplicateModifier(String),
}

impl fmt::Display for AcceleratorError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AcceleratorError::Empty => write!(f, "acelerador vacío"),
            AcceleratorError::MissingKey => write!(f, "falta la tecla final del acelerador"),
            AcceleratorError::UnknownModifier(t) => write!(f, "modificador desconocido: {t}"),
            AcceleratorError::DuplicateModifier(t) => write!(f, "modificador duplicado: {t}"),
        }
    }
}

impl std::error::Error for AcceleratorError {}

/// Normaliza el nombre de una tecla a su forma canónica.
///
/// Una sola letra/dígito ASCII → mayúscula. Teclas con nombre (Space, Enter, …) → Title-case.
fn normalize_key(token: &str) -> String {
    if token.chars().count() == 1 {
        return token.to_ascii_uppercase();
    }
    let mut chars = token.chars();
    match chars.next() {
        Some(first) => {
            let rest: String = chars.as_str().to_ascii_lowercase();
            format!("{}{}", first.to_ascii_uppercase(), rest)
        }
        None => String::new(),
    }
}

/// Parsea, valida y normaliza un acelerador. Reglas idénticas al parser TS de `@murmur/core`.
pub fn parse(s: &str) -> Result<Accelerator, AcceleratorError> {
    let tokens: Vec<&str> = s.split('+').map(|t| t.trim()).collect();

    // Cadena vacía, o todos los tokens vacíos.
    if tokens.iter().all(|t| t.is_empty()) {
        return Err(AcceleratorError::Empty);
    }

    // El último token es la tecla; el resto deben ser modificadores.
    let (key_token, mod_tokens) = tokens.split_last().expect("tokens no vacío");

    // Tecla vacía → falta la tecla (p. ej. "Shift+").
    if key_token.is_empty() {
        return Err(AcceleratorError::MissingKey);
    }

    // La tecla no puede ser un modificador.
    if Modifier::from_token(key_token).is_some() {
        return Err(AcceleratorError::MissingKey);
    }

    let mut mods: Vec<Modifier> = Vec::new();
    for token in mod_tokens {
        if token.is_empty() {
            // Separador suelto (p. ej. "Ctrl++A") → modificador vacío desconocido.
            return Err(AcceleratorError::MissingKey);
        }
        match Modifier::from_token(token) {
            Some(m) => {
                if mods.contains(&m) {
                    return Err(AcceleratorError::DuplicateModifier((*token).to_string()));
                }
                mods.push(m);
            }
            None => return Err(AcceleratorError::UnknownModifier((*token).to_string())),
        }
    }

    // Orden canónico estable.
    mods.sort_by_key(|m| m.order());

    Ok(Accelerator {
        mods,
        key: normalize_key(key_token),
    })
}

impl fmt::Display for Accelerator {
    /// Forma canónica `Mod+Mod+Key`.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for m in &self.mods {
            write!(f, "{}+", m.canonical())?;
        }
        write!(f, "{}", self.key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_valid_accelerator() {
        let acc = parse("CommandOrControl+Shift+Space").unwrap();
        assert_eq!(acc.mods, vec![Modifier::CommandOrControl, Modifier::Shift]);
        assert_eq!(acc.key, "Space");
        assert_eq!(acc.to_string(), "CommandOrControl+Shift+Space");
    }

    #[test]
    fn parses_single_key_without_modifiers() {
        let acc = parse("F1").unwrap();
        assert!(acc.mods.is_empty());
        assert_eq!(acc.key, "F1");
        assert_eq!(acc.to_string(), "F1");
    }

    #[test]
    fn normalizes_modifier_aliases_and_case() {
        // cmdorctrl → CommandOrControl, ctrl → Control, option → Alt, meta → Super.
        let acc = parse("cmdorctrl+OPTION+meta+a").unwrap();
        assert_eq!(
            acc.mods,
            vec![Modifier::CommandOrControl, Modifier::Alt, Modifier::Super]
        );
        assert_eq!(acc.key, "A");
        assert_eq!(acc.to_string(), "CommandOrControl+Alt+Super+A");
    }

    #[test]
    fn ctrl_and_control_are_equivalent_and_duplicate() {
        assert_eq!(
            parse("Ctrl+Control+A"),
            Err(AcceleratorError::DuplicateModifier("Control".to_string()))
        );
    }

    #[test]
    fn canonical_order_is_stable() {
        // Entrada desordenada → orden canónico.
        let acc = parse("Shift+Alt+Control+K").unwrap();
        assert_eq!(acc.to_string(), "Control+Alt+Shift+K");
    }

    #[test]
    fn rejects_empty() {
        assert_eq!(parse(""), Err(AcceleratorError::Empty));
        assert_eq!(parse("   "), Err(AcceleratorError::Empty));
    }

    #[test]
    fn rejects_missing_key() {
        assert_eq!(parse("Shift+"), Err(AcceleratorError::MissingKey));
        // Solo modificadores, sin tecla.
        assert_eq!(parse("Ctrl+Shift"), Err(AcceleratorError::MissingKey));
    }

    #[test]
    fn rejects_unknown_modifier() {
        assert_eq!(
            parse("Foo+A"),
            Err(AcceleratorError::UnknownModifier("Foo".to_string()))
        );
    }

    #[test]
    fn rejects_duplicate_modifier() {
        assert_eq!(
            parse("Ctrl+Ctrl+A"),
            Err(AcceleratorError::DuplicateModifier("Ctrl".to_string()))
        );
    }

    #[test]
    fn round_trip_parse_to_string() {
        for input in [
            "CommandOrControl+Shift+Space",
            "cmdorctrl+option+meta+a",
            "Shift+Alt+Control+K",
            "F5",
        ] {
            let acc = parse(input).unwrap();
            let canonical = acc.to_string();
            // parse(to_string) == parse(input) (idempotencia sobre la forma canónica).
            assert_eq!(parse(&canonical).unwrap(), acc);
        }
    }
}
