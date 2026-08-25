import { sql } from "./db";

export async function upsertUser(user: {
  googleId: string;
  email: string;
  name: string | null;
  image: string | null;
}): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    INSERT INTO users (google_id, email, name, image)
    VALUES (${user.googleId}, ${user.email}, ${user.name}, ${user.image})
    ON CONFLICT (google_id) DO UPDATE SET
      email = EXCLUDED.email,
      name = EXCLUDED.name,
      image = EXCLUDED.image
    RETURNING id
  `;
  return rows[0].id;
}
