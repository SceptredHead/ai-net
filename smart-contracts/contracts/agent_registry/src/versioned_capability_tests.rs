//! # Unit tests for versioned capability pinning
//!
//! Covers:
//! - Semver validation rejects invalid strings
//! - `register_capability_version` happy path
//! - `get_agents_by_capability_version` with Exact, Compatible, PatchOnly
//! - Deprecated versions excluded from default queries but present in
//!   `get_capability_versions`
//! - Boundary cases for Compatible and PatchOnly ranges

#![cfg(test)]

use soroban_sdk::{
    testutils::Address as _,
    Address, Env, String, Symbol, Vec, Map, Val,
};

use crate::{AgentRecord, AgentRegistryContract, AgentRegistryContractClient, VersionRange};

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn mk_string(env: &Env, s: &str) -> String {
    String::from_str(env, s)
}

fn setup(env: &Env) -> (AgentRegistryContractClient, Address) {
    let contract_id = env.register(AgentRegistryContract, ());
    let client = AgentRegistryContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    env.mock_all_auths();
    client.initialize(&admin).unwrap();
    (client, admin)
}

fn register_agent(env: &Env, client: &AgentRegistryContractClient, id: &str, cap: &str, owner: &Address) {
    let record = AgentRecord {
        id: Symbol::new(env, id),
        capability: Symbol::new(env, cap),
        price_stroops: 1_000,
        endpoint: mk_string(env, "https://agent.test"),
        owner: owner.clone(),
        metadata: Map::new(env),
        bond_amount: 100_000_000,
    };
    client.register_agent(&record).unwrap();
}

// ─── Semver validation ────────────────────────────────────────────────────────

#[test]
fn reject_non_semver_latest() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let owner = Address::generate(&env);
    env.mock_all_auths();
    register_agent(&env, &client, "agent1", "research", &owner);

    let result = client.register_capability_version(
        &Symbol::new(&env, "agent1"),
        &Symbol::new(&env, "research"),
        &mk_string(&env, "latest"),
    );
    assert!(result.is_err(), "\"latest\" must be rejected");
}

#[test]
fn reject_non_semver_v_prefix() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let owner = Address::generate(&env);
    env.mock_all_auths();
    register_agent(&env, &client, "agent1", "research", &owner);

    let result = client.register_capability_version(
        &Symbol::new(&env, "agent1"),
        &Symbol::new(&env, "research"),
        &mk_string(&env, "v1"),
    );
    assert!(result.is_err(), "\"v1\" must be rejected");
}

#[test]
fn reject_non_semver_two_parts() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let owner = Address::generate(&env);
    env.mock_all_auths();
    register_agent(&env, &client, "agent1", "research", &owner);

    let result = client.register_capability_version(
        &Symbol::new(&env, "agent1"),
        &Symbol::new(&env, "research"),
        &mk_string(&env, "1.0"),
    );
    assert!(result.is_err(), "\"1.0\" (two parts) must be rejected");
}

#[test]
fn accept_valid_semver() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let owner = Address::generate(&env);
    env.mock_all_auths();
    register_agent(&env, &client, "agent1", "research", &owner);

    client.register_capability_version(
        &Symbol::new(&env, "agent1"),
        &Symbol::new(&env, "research"),
        &mk_string(&env, "2.1.0"),
    ).unwrap();
}

// ─── Exact range ─────────────────────────────────────────────────────────────

#[test]
fn exact_range_matches_only_exact_version() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let owner = Address::generate(&env);
    env.mock_all_auths();
    register_agent(&env, &client, "agent1", "research", &owner);
    register_agent(&env, &client, "agent2", "research", &owner);

    client.register_capability_version(
        &Symbol::new(&env, "agent1"),
        &Symbol::new(&env, "research"),
        &mk_string(&env, "2.1.0"),
    ).unwrap();
    client.register_capability_version(
        &Symbol::new(&env, "agent2"),
        &Symbol::new(&env, "research"),
        &mk_string(&env, "2.2.0"),
    ).unwrap();

    let results = client.get_agents_by_capability_version(
        &Symbol::new(&env, "research"),
        &VersionRange::Exact(mk_string(&env, "2.1.0")),
    );
    assert_eq!(results.len(), 1);
    assert_eq!(results.get(0).unwrap().version, mk_string(&env, "2.1.0"));
}

// ─── Compatible (caret) range ─────────────────────────────────────────────────

#[test]
fn compatible_range_matches_same_major() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let owner = Address::generate(&env);
    env.mock_all_auths();

    for (id, ver) in [("a1", "1.0.0"), ("a2", "1.2.3"), ("a3", "1.9.9")] {
        register_agent(&env, &client, id, "coding", &owner);
        client.register_capability_version(
            &Symbol::new(&env, id),
            &Symbol::new(&env, "coding"),
            &mk_string(&env, ver),
        ).unwrap();
    }
    // 2.0.0 must NOT match
    register_agent(&env, &client, "a4", "coding", &owner);
    client.register_capability_version(
        &Symbol::new(&env, "a4"),
        &Symbol::new(&env, "coding"),
        &mk_string(&env, "2.0.0"),
    ).unwrap();

    let results = client.get_agents_by_capability_version(
        &Symbol::new(&env, "coding"),
        &VersionRange::Compatible(mk_string(&env, "1.0.0")),
    );
    assert_eq!(results.len(), 3, "1.x.x >= 1.0.0 should match three agents");

    // Verify 2.0.0 is not included
    for r in results.iter() {
        assert_ne!(r.version, mk_string(&env, "2.0.0"));
    }
}

#[test]
fn compatible_range_excludes_older_minor() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let owner = Address::generate(&env);
    env.mock_all_auths();

    // 1.0.0 should NOT match Compatible("1.1.0")
    register_agent(&env, &client, "a1", "coding", &owner);
    client.register_capability_version(
        &Symbol::new(&env, "a1"),
        &Symbol::new(&env, "coding"),
        &mk_string(&env, "1.0.0"),
    ).unwrap();
    // 1.1.0 should match
    register_agent(&env, &client, "a2", "coding", &owner);
    client.register_capability_version(
        &Symbol::new(&env, "a2"),
        &Symbol::new(&env, "coding"),
        &mk_string(&env, "1.1.0"),
    ).unwrap();

    let results = client.get_agents_by_capability_version(
        &Symbol::new(&env, "coding"),
        &VersionRange::Compatible(mk_string(&env, "1.1.0")),
    );
    assert_eq!(results.len(), 1);
    assert_eq!(results.get(0).unwrap().version, mk_string(&env, "1.1.0"));
}

// ─── PatchOnly (tilde) range ─────────────────────────────────────────────────

#[test]
fn patch_range_matches_same_major_minor() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let owner = Address::generate(&env);
    env.mock_all_auths();

    // 1.2.0 and 1.2.9 should match PatchOnly("1.2.0")
    for (id, ver) in [("a1", "1.2.0"), ("a2", "1.2.9")] {
        register_agent(&env, &client, id, "risk", &owner);
        client.register_capability_version(
            &Symbol::new(&env, id),
            &Symbol::new(&env, "risk"),
            &mk_string(&env, ver),
        ).unwrap();
    }
    // 1.3.0 must NOT match
    register_agent(&env, &client, "a3", "risk", &owner);
    client.register_capability_version(
        &Symbol::new(&env, "a3"),
        &Symbol::new(&env, "risk"),
        &mk_string(&env, "1.3.0"),
    ).unwrap();

    let results = client.get_agents_by_capability_version(
        &Symbol::new(&env, "risk"),
        &VersionRange::PatchOnly(mk_string(&env, "1.2.0")),
    );
    assert_eq!(results.len(), 2);
    for r in results.iter() {
        assert_ne!(r.version, mk_string(&env, "1.3.0"));
    }
}

#[test]
fn patch_range_excludes_older_patch() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let owner = Address::generate(&env);
    env.mock_all_auths();

    register_agent(&env, &client, "a1", "risk", &owner);
    client.register_capability_version(
        &Symbol::new(&env, "a1"),
        &Symbol::new(&env, "risk"),
        &mk_string(&env, "1.2.0"),
    ).unwrap();

    // PatchOnly("1.2.5") must not match 1.2.0
    let results = client.get_agents_by_capability_version(
        &Symbol::new(&env, "risk"),
        &VersionRange::PatchOnly(mk_string(&env, "1.2.5")),
    );
    assert_eq!(results.len(), 0);
}

// ─── Deprecation ─────────────────────────────────────────────────────────────

#[test]
fn deprecated_versions_excluded_from_default_query() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let owner = Address::generate(&env);
    env.mock_all_auths();

    register_agent(&env, &client, "agent1", "research", &owner);
    client.register_capability_version(
        &Symbol::new(&env, "agent1"),
        &Symbol::new(&env, "research"),
        &mk_string(&env, "1.0.0"),
    ).unwrap();

    // Deprecate the version.
    client.deprecate_capability_version(
        &Symbol::new(&env, "agent1"),
        &Symbol::new(&env, "research"),
        &mk_string(&env, "1.0.0"),
    ).unwrap();

    // Should not appear in get_agents_by_capability_version.
    let results = client.get_agents_by_capability_version(
        &Symbol::new(&env, "research"),
        &VersionRange::Compatible(mk_string(&env, "1.0.0")),
    );
    assert_eq!(results.len(), 0, "deprecated version must be excluded");
}

#[test]
fn deprecated_versions_present_in_get_all_versions() {
    let env = Env::default();
    let (client, _) = setup(&env);
    let owner = Address::generate(&env);
    env.mock_all_auths();

    register_agent(&env, &client, "agent1", "research", &owner);
    client.register_capability_version(
        &Symbol::new(&env, "agent1"),
        &Symbol::new(&env, "research"),
        &mk_string(&env, "1.0.0"),
    ).unwrap();
    client.deprecate_capability_version(
        &Symbol::new(&env, "agent1"),
        &Symbol::new(&env, "research"),
        &mk_string(&env, "1.0.0"),
    ).unwrap();

    let all = client.get_capability_versions(&Symbol::new(&env, "research"));
    assert_eq!(all.len(), 1);
    let entry = all.get(0).unwrap();
    assert!(entry.deprecated_at.is_some(), "deprecated_at must be set");
}
