-- Création de la base et de l'utilisateur d'un client sur le PostgreSQL partagé.
-- À exécuter avec un compte administrateur (superutilisateur ou CREATEDB + CREATEROLE) :
--   psql "postgresql://admin:...@hote:5432/postgres" \
--        -v db=client_acme -v dbuser=client_acme -v dbpassword='mot_de_passe_long_sans_guillemet_simple' \
--        -f scripts/ops/create-client-db.sql
-- Choisissez des noms en minuscules, chiffres et _ uniquement. Le mot de passe sera encodé dans DATABASE_URL (@ → %40, ! → %21).

\set ON_ERROR_STOP on

CREATE ROLE :"dbuser" LOGIN PASSWORD :'dbpassword';
CREATE DATABASE :"db" OWNER :"dbuser";
-- Isolement : aucun autre utilisateur ne peut ouvrir la base d'un client.
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT ALL ON DATABASE :"db" TO :"dbuser";
