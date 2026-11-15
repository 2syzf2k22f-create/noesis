alter table noesis.pc_allow_rules drop constraint if exists pc_allow_rules_category_check;
alter table noesis.pc_allow_rules add constraint pc_allow_rules_category_check check (category in ('launch_app','open_website','media_keys','read_only','open_path','window_control','file_write','download'));
