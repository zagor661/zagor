import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { DEFAULT_RECIPES } from '@/lib/foodcostRecipes'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: Request) {
  try {
    const { mealId, locationId, recipeId } = await req.json()

    if (!mealId || !locationId || !recipeId) {
      return NextResponse.json({ error: 'Missing mealId, locationId, or recipeId' }, { status: 400 })
    }

    // Find recipe in hardcoded recipes
    const recipe = DEFAULT_RECIPES.find(r => r.id === recipeId)
    if (!recipe) {
      return NextResponse.json({ error: `Recipe not found: ${recipeId}` }, { status: 404 })
    }

    // Create deduction records for each ingredient
    const deductions = recipe.lines.map(line => ({
      meal_id: mealId,
      location_id: locationId,
      recipe_id: recipeId,
      ingredient_name: line.productName,
      quantity_kg: line.quantity, // already in kg
    }))

    const { error } = await supabase
      .from('meal_deductions')
      .insert(deductions)

    if (error) {
      console.error('[meal-deduct]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      recipe: recipe.name,
      ingredients: deductions.length,
      totalKg: Math.round(deductions.reduce((s, d) => s + d.quantity_kg, 0) * 1000) / 1000,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
