import type { Knex } from "knex";

const TABLE = "core_admin.module_workspaces";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    do $$
    begin
      if not exists (
        select 1 from pg_constraint
        where conname = 'module_workspaces_type_check'
          and conrelid = '${TABLE}'::regclass
      ) then
        alter table ${TABLE}
          add constraint module_workspaces_type_check
          check (workspace_type in ('normal', 'public_information', 'contact_us'));
      end if;

      if not exists (
        select 1 from pg_constraint
        where conname = 'module_workspaces_visibility_check'
          and conrelid = '${TABLE}'::regclass
      ) then
        alter table ${TABLE}
          add constraint module_workspaces_visibility_check
          check (
            (workspace_type <> 'normal' or (not public_visible and not contact_enabled))
            and (workspace_type <> 'public_information' or not contact_enabled)
          );
      end if;
    end
    $$;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`alter table ${TABLE} drop constraint if exists module_workspaces_visibility_check`);
  await knex.raw(`alter table ${TABLE} drop constraint if exists module_workspaces_type_check`);
}