-- 02C MOTOR-LLM — knobs read by name (§3.8). Knobs are [C] config (not RESULTs), so seeding is §14-allowed.
begin;
select plan(3);
select is( catalog.knob_required_num('motor_max_loops'), 3::numeric, 'motor_max_loops seeded = 3' );
select ok( catalog.knob_required_num('motor_min_confidence') > 0, 'motor_min_confidence seeded > 0' );
select is( catalog.knob_text('motor_allowed_actions_default'), 'A1,A4,A6', 'default auto-action whitelist = non-money LOW set' );
select * from finish();
rollback;
