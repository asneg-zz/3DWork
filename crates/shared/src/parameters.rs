use crate::{Body, ParameterValue};
#[cfg(test)]
use crate::Parameter;
use evalexpr::{build_operator_tree, ContextWithMutableVariables, HashMapContext, Value};
use std::collections::{HashMap, HashSet};

/// Результат вычисления параметра
pub type ParameterResult = Result<f64, ParameterError>;

/// Ошибки при работе с параметрами
#[derive(Debug, Clone, PartialEq)]
pub enum ParameterError {
    /// Параметр не найден
    NotFound(String),
    /// Ошибка парсинга формулы
    ParseError(String),
    /// Ошибка вычисления формулы
    EvaluationError(String),
    /// Циклическая зависимость
    CircularDependency(Vec<String>),
    /// Неверный тип значения
    InvalidType(String),
}

impl std::fmt::Display for ParameterError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ParameterError::NotFound(name) => write!(f, "Parameter '{}' not found", name),
            ParameterError::ParseError(msg) => write!(f, "Parse error: {}", msg),
            ParameterError::EvaluationError(msg) => write!(f, "Evaluation error: {}", msg),
            ParameterError::CircularDependency(chain) => {
                write!(f, "Circular dependency: {}", chain.join(" -> "))
            }
            ParameterError::InvalidType(msg) => write!(f, "Invalid type: {}", msg),
        }
    }
}

impl std::error::Error for ParameterError {}

impl Body {
    /// Вычислить значение параметра
    pub fn evaluate_parameter(&self, param_name: &str) -> ParameterResult {
        let mut visited = HashSet::new();
        let mut path = Vec::new();
        self.evaluate_parameter_internal(param_name, &mut visited, &mut path)
    }

    /// Внутренняя рекурсивная функция для вычисления параметра
    fn evaluate_parameter_internal(
        &self,
        param_name: &str,
        visited: &mut HashSet<String>,
        path: &mut Vec<String>,
    ) -> ParameterResult {
        // Проверка на циклическую зависимость
        if visited.contains(param_name) {
            path.push(param_name.to_string());
            return Err(ParameterError::CircularDependency(path.clone()));
        }

        // Получить параметр
        let param = self
            .parameters
            .get(param_name)
            .ok_or_else(|| ParameterError::NotFound(param_name.to_string()))?;

        visited.insert(param_name.to_string());
        path.push(param_name.to_string());

        let result = match &param.value {
            ParameterValue::Number { value } => Ok(*value),

            ParameterValue::Formula { expression } => {
                // Создать контекст для evalexpr
                let mut context = HashMapContext::new();

                // Получить зависимости этого параметра
                let deps = self.get_parameter_dependencies(param_name);

                // Добавить только необходимые параметры в контекст (рекурсивно вычислить зависимости)
                for dep_name in deps {
                    let dep_value = self.evaluate_parameter_internal(&dep_name, visited, path)?;
                    context
                        .set_value(dep_name.clone(), Value::Float(dep_value))
                        .map_err(|e| ParameterError::EvaluationError(e.to_string()))?;
                }

                // Добавить математические константы
                context
                    .set_value("PI".to_string(), Value::Float(std::f64::consts::PI))
                    .ok();
                context
                    .set_value("E".to_string(), Value::Float(std::f64::consts::E))
                    .ok();

                // Парсить и вычислить выражение
                let tree = build_operator_tree(expression)
                    .map_err(|e| ParameterError::ParseError(e.to_string()))?;

                let value = tree
                    .eval_with_context(&context)
                    .map_err(|e| ParameterError::EvaluationError(e.to_string()))?;

                // Преобразовать в f64
                match value {
                    Value::Float(f) => Ok(f),
                    Value::Int(i) => Ok(i as f64),
                    _ => Err(ParameterError::InvalidType(format!(
                        "Expected number, got {:?}",
                        value
                    ))),
                }
            }

            ParameterValue::Reference { reference: _ } => {
                // TODO: реализовать ссылки на свойства других объектов
                // Пока что возвращаем ошибку
                Err(ParameterError::EvaluationError(
                    "Parameter references not yet implemented".to_string(),
                ))
            }
        };

        visited.remove(param_name);
        path.pop();

        result
    }

    /// Получить все параметры с вычисленными значениями
    pub fn evaluate_all_parameters(&self) -> HashMap<String, ParameterResult> {
        self.parameters
            .keys()
            .map(|name| (name.clone(), self.evaluate_parameter(name)))
            .collect()
    }

    /// Получить список зависимостей параметра (какие параметры он использует)
    pub fn get_parameter_dependencies(&self, param_name: &str) -> HashSet<String> {
        let mut deps = HashSet::new();

        if let Some(param) = self.parameters.get(param_name) {
            if let ParameterValue::Formula { expression } = &param.value {
                // Простой способ: проверить все параметры, входят ли их имена в формулу
                for (name, _) in &self.parameters {
                    if name != param_name && expression.contains(name) {
                        deps.insert(name.clone());
                    }
                }
            }
        }

        deps
    }

    /// Проверить, есть ли циклические зависимости в параметрах
    pub fn has_circular_dependencies(&self) -> bool {
        for name in self.parameters.keys() {
            if self.evaluate_parameter(name).is_err() {
                return true;
            }
        }
        false
    }

    /// Обновить все размеры (Dimension), привязанные к параметрам
    /// Вызывается после изменения значения параметра
    pub fn update_dimensions_from_parameters(&mut self) {
        use crate::{Feature, SketchElement};

        // Сначала вычислить все значения параметров
        let param_values: HashMap<String, f64> = self
            .parameters
            .keys()
            .filter_map(|name| {
                self.evaluate_parameter(name)
                    .ok()
                    .map(|value| (name.clone(), value))
            })
            .collect();

        // Теперь обновить размеры используя вычисленные значения
        for feature in &mut self.features {
            let sketch = match feature {
                Feature::Sketch { sketch, .. } => sketch,
                Feature::BaseExtrude { sketch, .. } => sketch,
                Feature::BaseRevolve { sketch, .. } => sketch,
                _ => continue,
            };

            // Пройти по всем элементам скетча
            for element in &mut sketch.elements {
                if let SketchElement::Dimension { parameter_name, value, .. } = element {
                    // Если размер привязан к параметру
                    if let Some(param_name) = parameter_name {
                        // Получить вычисленное значение из карты
                        if let Some(&new_value) = param_values.get(param_name) {
                            *value = new_value;
                        }
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Feature, Primitive, Transform};

    fn create_test_body() -> Body {
        Body {
            id: "test_body".to_string(),
            name: "Test Body".to_string(),
            features: vec![Feature::BasePrimitive {
                id: "prim1".to_string(),
                primitive: Primitive::Cube {
                    width: 1.0,
                    height: 1.0,
                    depth: 1.0,
                },
                transform: Transform::new(),
            }],
            visible: true,
            parameters: HashMap::new(),
        }
    }

    #[test]
    fn test_evaluate_number_parameter() {
        let mut body = create_test_body();
        body.parameters.insert(
            "width".to_string(),
            Parameter {
                name: "width".to_string(),
                value: ParameterValue::Number { value: 10.0 },
                unit: Some("mm".to_string()),
                description: None,
            },
        );

        let result = body.evaluate_parameter("width");
        assert_eq!(result, Ok(10.0));
    }

    #[test]
    fn test_evaluate_formula_parameter() {
        let mut body = create_test_body();
        body.parameters.insert(
            "width".to_string(),
            Parameter {
                name: "width".to_string(),
                value: ParameterValue::Number { value: 10.0 },
                unit: Some("mm".to_string()),
                description: None,
            },
        );
        body.parameters.insert(
            "height".to_string(),
            Parameter {
                name: "height".to_string(),
                value: ParameterValue::Formula {
                    expression: "width * 2".to_string(),
                },
                unit: Some("mm".to_string()),
                description: None,
            },
        );

        let result = body.evaluate_parameter("height");
        assert_eq!(result, Ok(20.0));
    }

    #[test]
    fn test_circular_dependency() {
        let mut body = create_test_body();
        body.parameters.insert(
            "a".to_string(),
            Parameter {
                name: "a".to_string(),
                value: ParameterValue::Formula {
                    expression: "b + 1".to_string(),
                },
                unit: None,
                description: None,
            },
        );
        body.parameters.insert(
            "b".to_string(),
            Parameter {
                name: "b".to_string(),
                value: ParameterValue::Formula {
                    expression: "a + 1".to_string(),
                },
                unit: None,
                description: None,
            },
        );

        let result = body.evaluate_parameter("a");
        assert!(matches!(result, Err(ParameterError::CircularDependency(_))));
    }

    #[test]
    fn test_complex_formula() {
        let mut body = create_test_body();
        body.parameters.insert(
            "radius".to_string(),
            Parameter {
                name: "radius".to_string(),
                value: ParameterValue::Number { value: 5.0 },
                unit: Some("mm".to_string()),
                description: None,
            },
        );
        body.parameters.insert(
            "area".to_string(),
            Parameter {
                name: "area".to_string(),
                value: ParameterValue::Formula {
                    expression: "PI * radius^2".to_string(),
                },
                unit: Some("mm^2".to_string()),
                description: None,
            },
        );

        let result = body.evaluate_parameter("area");
        assert!(result.is_ok());
        let value = result.unwrap();
        let expected = std::f64::consts::PI * 25.0;
        assert!((value - expected).abs() < 0.0001);
    }

    #[test]
    fn test_get_dependencies() {
        let mut body = create_test_body();
        body.parameters.insert(
            "width".to_string(),
            Parameter {
                name: "width".to_string(),
                value: ParameterValue::Number { value: 10.0 },
                unit: None,
                description: None,
            },
        );
        body.parameters.insert(
            "height".to_string(),
            Parameter {
                name: "height".to_string(),
                value: ParameterValue::Formula {
                    expression: "width * 2".to_string(),
                },
                unit: None,
                description: None,
            },
        );

        let deps = body.get_parameter_dependencies("height");
        assert!(deps.contains("width"));
        assert_eq!(deps.len(), 1);
    }
}
