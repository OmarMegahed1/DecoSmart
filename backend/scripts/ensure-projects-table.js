require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      user_id text NOT NULL,
      generation_id uuid,
      operation_id text,
      world_id text,
      name text NOT NULL,
      status generation_status DEFAULT 'done' NOT NULL,
      caption text,
      spz_urls jsonb,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    );
  `);

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'projects_user_id_user_id_fk'
      ) THEN
        ALTER TABLE projects
        ADD CONSTRAINT projects_user_id_user_id_fk
        FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE cascade;
      END IF;
    END
    $$;
  `);

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'projects_generation_id_generations_id_fk'
      ) THEN
        ALTER TABLE projects
        ADD CONSTRAINT projects_generation_id_generations_id_fk
        FOREIGN KEY (generation_id) REFERENCES generations(id) ON DELETE set null;
      END IF;
    END
    $$;
  `);

  console.log('✅ projects table ensured safely');
  await client.end();
}

main().catch(async (err) => {
  console.error('❌ ensure-projects-table failed:', err);
  process.exit(1);
});
