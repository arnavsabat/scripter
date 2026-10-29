-- Guests (D-108): a "Try a demo script" person, signed in through the guest app client. Refused
-- once guest_until passes; the daily purge then deletes them, their scripts and their Cognito user.
alter table users add column guest_until timestamptz;
create index users_guest_until on users (guest_until) where guest_until is not null;
alter table user_identities drop constraint user_identities_provider_check;
alter table user_identities add constraint user_identities_provider_check
  check (provider in ('email', 'google', 'test', 'guest'));
