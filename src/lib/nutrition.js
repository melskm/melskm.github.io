// Общие константы трекера КБЖУ — используются и сайтом (src/), и ботом (bot/).
// Меняй цифры здесь, они подхватятся везде.

export const NORMS = {
  rest: { kcal: 2000, protein: 150, fat: 65, carbs: 190 },
  gym: { kcal: 2200, protein: 150, fat: 65, carbs: 230 },
}

// Сожжено на тренировке (кардио), для отображения в дневнике
export const BURN_KCAL = { rest: 0, gym: 400 }

// Приёмы пищи: целевые ккал — середины из плана (завтрак 400–500, обед 600–700, перекус 150–200, ужин 600–700)
export const MEALS = [
  { id: 'breakfast', title: 'Завтрак', time: '10:00', targetKcal: 450, emoji: '🍳' },
  { id: 'lunch', title: 'Обед', time: '14:00', targetKcal: 650, emoji: '🥗' },
  { id: 'snack', title: 'Перекус', time: '17:00', targetKcal: 175, emoji: '🍎' },
  { id: 'dinner', title: 'Ужин', time: '19:00', targetKcal: 650, emoji: '🍤' },
]

// Приём пищи по часу (МСК): <12 завтрак, 12–16 обед, 16–18 перекус, ≥18 ужин
export const mealByHour = (h) => (h < 12 ? 'breakfast' : h < 16 ? 'lunch' : h < 18 ? 'snack' : 'dinner')

export const mealTitle = (id) => MEALS.find((m) => m.id === id)?.title || 'Приём пищи'

// Правила-предупреждения
export const PROTEIN_MIN = 120 // ниже этого к вечеру — «Белок недобран»
export const EVENING_HOUR = 18 // с этого часа считаем «вечер»
export const CARBS_CUTOFF_HOUR = 16 // после этого часа — «Углеводы после 16:00»

// Ключ типа дня в таблице settings
export const dayTypeKey = (date) => `daytype:${date}`
