// language JavaScript
// < definition prototype-members 1.0.0 src/`use.mjs`/

/** @import { Connection, DirectConnection, BracketConnection, MixedConnection, DefinedConnection } from './connection.mjs' */

/** @param {Connection} connection */
export function schemaVersion(connection) {
//              ^^^^^^^^^^^^^ definition prototype-members 1.0.0 src/`use.mjs`/schemaVersion().
//                            ^^^^^^^^^^ definition prototype-members 1.0.0 src/`use.mjs`/schemaVersion().(connection)
  return [
    connection.getSchemaVersion(),
//  ^^^^^^^^^^ reference prototype-members 1.0.0 src/`use.mjs`/schemaVersion().(connection)
    connection.getVersion(),
//  ^^^^^^^^^^ reference prototype-members 1.0.0 src/`use.mjs`/schemaVersion().(connection)
    connection.version,
//  ^^^^^^^^^^ reference prototype-members 1.0.0 src/`use.mjs`/schemaVersion().(connection)
    connection['schema-version'],
//  ^^^^^^^^^^ reference prototype-members 1.0.0 src/`use.mjs`/schemaVersion().(connection)
    connection['computed-version'],
//  ^^^^^^^^^^ reference prototype-members 1.0.0 src/`use.mjs`/schemaVersion().(connection)
  ]
}

/** @param {DirectConnection} connection */
export function directVersion(connection) {
//              ^^^^^^^^^^^^^ definition prototype-members 1.0.0 src/`use.mjs`/directVersion().
//                            ^^^^^^^^^^ definition prototype-members 1.0.0 src/`use.mjs`/directVersion().(connection)
  return [
    connection.getVersion(),
//  ^^^^^^^^^^ reference prototype-members 1.0.0 src/`use.mjs`/directVersion().(connection)
    connection['getVersion'](),
//  ^^^^^^^^^^ reference prototype-members 1.0.0 src/`use.mjs`/directVersion().(connection)
    connection.version,
//  ^^^^^^^^^^ reference prototype-members 1.0.0 src/`use.mjs`/directVersion().(connection)
    connection['version'],
//  ^^^^^^^^^^ reference prototype-members 1.0.0 src/`use.mjs`/directVersion().(connection)
    connection.getSchemaVersion(),
//  ^^^^^^^^^^ reference prototype-members 1.0.0 src/`use.mjs`/directVersion().(connection)
    connection['getSchemaVersion'](),
//  ^^^^^^^^^^ reference prototype-members 1.0.0 src/`use.mjs`/directVersion().(connection)
    connection['schema-version'],
//  ^^^^^^^^^^ reference prototype-members 1.0.0 src/`use.mjs`/directVersion().(connection)
  ]
}

/** @param {BracketConnection} connection */
export function bracketVersion(connection) {
//              ^^^^^^^^^^^^^^ definition prototype-members 1.0.0 src/`use.mjs`/bracketVersion().
//                             ^^^^^^^^^^ definition prototype-members 1.0.0 src/`use.mjs`/bracketVersion().(connection)
  return [
    connection.getSchemaVersion(),
//  ^^^^^^^^^^ reference prototype-members 1.0.0 src/`use.mjs`/bracketVersion().(connection)
    connection.getVersion(),
//  ^^^^^^^^^^ reference prototype-members 1.0.0 src/`use.mjs`/bracketVersion().(connection)
    connection.version,
//  ^^^^^^^^^^ reference prototype-members 1.0.0 src/`use.mjs`/bracketVersion().(connection)
  ]
}

/** @param {MixedConnection} connection */
export function mixedVersion(connection) {
//              ^^^^^^^^^^^^ definition prototype-members 1.0.0 src/`use.mjs`/mixedVersion().
//                           ^^^^^^^^^^ definition prototype-members 1.0.0 src/`use.mjs`/mixedVersion().(connection)
  return [connection.getVersion(), connection.version]
//        ^^^^^^^^^^ reference prototype-members 1.0.0 src/`use.mjs`/mixedVersion().(connection)
//                                 ^^^^^^^^^^ reference prototype-members 1.0.0 src/`use.mjs`/mixedVersion().(connection)
}

/** @param {DefinedConnection} connection */
export function definedVersion(connection) {
//              ^^^^^^^^^^^^^^ definition prototype-members 1.0.0 src/`use.mjs`/definedVersion().
//                             ^^^^^^^^^^ definition prototype-members 1.0.0 src/`use.mjs`/definedVersion().(connection)
  connection.currentVersion = 19
//^^^^^^^^^^ reference prototype-members 1.0.0 src/`use.mjs`/definedVersion().(connection)
  return [
    connection.getVersion(),
//  ^^^^^^^^^^ reference prototype-members 1.0.0 src/`use.mjs`/definedVersion().(connection)
    connection['getVersion'](),
//  ^^^^^^^^^^ reference prototype-members 1.0.0 src/`use.mjs`/definedVersion().(connection)
    connection.version,
//  ^^^^^^^^^^ reference prototype-members 1.0.0 src/`use.mjs`/definedVersion().(connection)
    connection['schema-version'],
//  ^^^^^^^^^^ reference prototype-members 1.0.0 src/`use.mjs`/definedVersion().(connection)
    connection.currentVersion,
//  ^^^^^^^^^^ reference prototype-members 1.0.0 src/`use.mjs`/definedVersion().(connection)
  ]
}

/** @param {DirectConnection} connection */
export function updateVersion(connection) {
//              ^^^^^^^^^^^^^ definition prototype-members 1.0.0 src/`use.mjs`/updateVersion().
//                            ^^^^^^^^^^ definition prototype-members 1.0.0 src/`use.mjs`/updateVersion().(connection)
  connection.version = 9
//^^^^^^^^^^ reference prototype-members 1.0.0 src/`use.mjs`/updateVersion().(connection)
  connection['version'] = 10
//^^^^^^^^^^ reference prototype-members 1.0.0 src/`use.mjs`/updateVersion().(connection)
  connection.version += 1
//^^^^^^^^^^ reference prototype-members 1.0.0 src/`use.mjs`/updateVersion().(connection)
  return connection.version
//       ^^^^^^^^^^ reference prototype-members 1.0.0 src/`use.mjs`/updateVersion().(connection)
}

