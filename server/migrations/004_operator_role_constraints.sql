alter table memberships
  drop constraint if exists memberships_role_check;

alter table memberships
  add constraint memberships_role_check
  check (role in ('owner', 'admin', 'operator', 'member'));

alter table organization_invitations
  drop constraint if exists organization_invitations_role_check;

alter table organization_invitations
  add constraint organization_invitations_role_check
  check (role in ('admin', 'operator', 'member'));
