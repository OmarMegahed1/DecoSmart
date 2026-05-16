DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user' AND column_name = 'emailVerified'
  ) THEN
    ALTER TABLE "user" RENAME COLUMN "emailVerified" TO "email_verified";
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user' AND column_name = 'createdAt'
  ) THEN
    ALTER TABLE "user" RENAME COLUMN "createdAt" TO "created_at";
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user' AND column_name = 'updatedAt'
  ) THEN
    ALTER TABLE "user" RENAME COLUMN "updatedAt" TO "updated_at";
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'cad_job_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."cad_job_status" AS ENUM('pending', 'done', 'error');
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cad_jobs' AND column_name = 'status'
      AND udt_name <> 'cad_job_status'
  ) THEN
    ALTER TABLE "cad_jobs" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "cad_jobs" ALTER COLUMN "status" SET DATA TYPE "public"."cad_job_status" USING "status"::text::"public"."cad_job_status";
    ALTER TABLE "cad_jobs" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."cad_job_status";
  END IF;
END $$;
