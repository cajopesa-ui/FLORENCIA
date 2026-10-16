// Conexión con la base de datos compartida (Supabase).
// Esta clave es PÚBLICA a propósito: sola no sirve de nada,
// porque la base de datos exige además el código de 4 dígitos.
window.CONFIG = {
  supabaseUrl: '__SUPABASE_URL__',
  supabaseKey: '__SUPABASE_ANON_KEY__'
};
