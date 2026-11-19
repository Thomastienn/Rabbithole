// Runs one model-written command inside OpenAI's codex-windows-sandbox (elevated mode), with the
// rules the server gives bwrap on Linux: no network, a separate sandbox account that cannot see
// the learner's home or app data, reads of the workspace and runtime folders, writes only to the
// workspace. `--check` exits 0 once the one-time elevated setup has run; `--setup` runs that setup
// behind one UAC prompt and exits non-zero when it is declined or fails.
//
// rabbithole-sandbox --check
// rabbithole-sandbox --setup
// rabbithole-sandbox --workspace <dir> [--read <path>]... [--env KEY=VALUE]... -- <command>...

use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, PartialEq)]
enum Request {
    Check,
    Setup,
    Run {
        workspace: PathBuf,
        reads: Vec<PathBuf>,
        env: HashMap<String, String>,
        command: Vec<String>,
    },
}

fn parse(args: &[String]) -> Result<Request, String> {
    if args == ["--check"] {
        return Ok(Request::Check);
    }
    if args == ["--setup"] {
        return Ok(Request::Setup);
    }
    let (mut workspace, mut reads, mut env) = (None, Vec::new(), HashMap::new());
    let mut rest = args.iter();
    while let Some(flag) = rest.next() {
        if flag == "--" {
            let command: Vec<String> = rest.cloned().collect();
            let workspace: PathBuf = workspace.ok_or("missing --workspace")?;
            if command.is_empty() {
                return Err("missing command after --".into());
            }
            if !workspace.is_absolute() || reads.iter().any(|p: &PathBuf| !p.is_absolute()) {
                return Err("paths must be absolute".into());
            }
            return Ok(Request::Run {
                workspace,
                reads,
                env,
                command,
            });
        }
        let value = rest.next().ok_or(format!("missing value for {flag}"))?;
        match flag.as_str() {
            "--workspace" => workspace = Some(PathBuf::from(value)),
            "--read" => reads.push(PathBuf::from(value)),
            "--env" => {
                let (key, val) = value.split_once('=').ok_or("--env needs KEY=VALUE")?;
                env.insert(key.to_string(), val.to_string());
            }
            _ => return Err(format!("unexpected argument {flag}")),
        }
    }
    Err("missing -- before the command".into())
}

#[cfg(windows)]
fn sandbox_home() -> PathBuf {
    // Outside the data folder (%APPDATA%\rabbithole), so the sandbox's own state never shares it.
    PathBuf::from(std::env::var_os("LOCALAPPDATA").unwrap_or_default())
        .join("rabbithole")
        .join("sandbox")
}

#[cfg(windows)]
fn run(request: Request) -> Result<i32, String> {
    use codex_protocol::config_types::{WindowsSandboxLevel, WindowsSandboxProxySettingsMode};
    use codex_protocol::models::PermissionProfile;
    use codex_protocol::permissions::NetworkSandboxPolicy;
    use codex_utils_absolute_path::AbsolutePathBuf;
    use codex_windows_sandbox as sandbox;

    let home = sandbox_home();
    let ready = sandbox::sandbox_setup_is_complete(&home);
    let profile = PermissionProfile::workspace_write_with(
        &[],
        NetworkSandboxPolicy::Restricted,
        /*exclude_tmpdir_env_var*/ true,
        /*exclude_slash_tmp*/ true,
    );
    if request == Request::Setup {
        if ready {
            return Ok(0);
        }
        // The one UAC prompt; per-run read and write roots are applied at spawn time.
        std::fs::create_dir_all(&home).map_err(|e| e.to_string())?;
        let root = AbsolutePathBuf::from_absolute_path(&home).map_err(|e| e.to_string())?;
        let permissions =
            sandbox::ResolvedWindowsSandboxPermissions::try_from_permission_profile_for_workspace_roots(
                &profile,
                std::slice::from_ref(&root),
            )
            .map_err(|e| format!("{e:#}"))?;
        sandbox::run_elevated_setup(sandbox::SandboxSetupRequest {
            permissions: &permissions,
            command_cwd: &home,
            env_map: &HashMap::new(),
            codex_home: &home,
            proxy_enforced: false,
        })
        .map_err(|e| format!("{e:#}"))?;
        return Ok(if sandbox::sandbox_setup_is_complete(&home) {
            0
        } else {
            1
        });
    }
    let Request::Run {
        workspace,
        mut reads,
        mut env,
        command,
    } = request
    else {
        return Ok(if ready { 0 } else { 1 });
    };
    // Never trigger the UAC prompt from a render; first-run setup or Settings runs it.
    if !ready {
        return Err("the Windows sandbox is not set up".into());
    }
    let root = AbsolutePathBuf::from_absolute_path(&workspace).map_err(|e| e.to_string())?;
    reads.push(workspace.clone());
    // Windows programs need these; the workspace stands in for bwrap's private /tmp.
    for key in ["SystemRoot", "windir"] {
        if let Some(value) = std::env::var_os(key) {
            env.insert(key.into(), value.to_string_lossy().into_owned());
        }
    }
    for key in ["TEMP", "TMP"] {
        env.insert(key.into(), workspace.to_string_lossy().into_owned());
    }
    let writes = [workspace.clone()];
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| e.to_string())?;
    runtime.block_on(async {
        let spawned = sandbox::spawn_windows_sandbox_session_for_level(
            sandbox::WindowsSandboxSessionRequest {
                permission_profile: &profile,
                workspace_roots: std::slice::from_ref(&root),
                codex_home: &home,
                command,
                cwd: &workspace,
                env_map: env,
                windows_sandbox_level: WindowsSandboxLevel::Elevated,
                proxy_enforced: false,
                network_proxy_restricting_sid: None,
                proxy_settings_mode: WindowsSandboxProxySettingsMode::Reconcile,
                timeout_ms: None,
                read_roots_override: Some(&reads),
                read_roots_include_platform_defaults: true,
                write_roots_override: Some(&writes),
                deny_read_paths_override: &[],
                deny_write_paths_override: &[],
                tty: false,
                stdin_open: true,
            },
        )
        .await
        .map_err(|e| format!("{e:#}"))?;
        Ok(sandbox::forward_sandbox_session_stdio(spawned).await)
    })
}

#[cfg(not(windows))]
fn run(_: Request) -> Result<i32, String> {
    Err("rabbithole-sandbox runs only on Windows; Linux uses bwrap".into())
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let code = parse(&args).and_then(run).unwrap_or_else(|error| {
        eprintln!("rabbithole-sandbox: {error}");
        125
    });
    std::process::exit(code);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn parses_check() {
        assert_eq!(parse(&args(&["--check"])), Ok(Request::Check));
        assert_eq!(parse(&args(&["--setup"])), Ok(Request::Setup));
    }

    #[test]
    fn parses_a_run_and_keeps_the_command_verbatim() {
        let request = parse(&args(&[
            "--workspace",
            "/w",
            "--read",
            "/node",
            "--env",
            "HOME=/w",
            "--env",
            "A=b=c",
            "--",
            "/node",
            "--check",
            "-",
        ]))
        .unwrap();
        assert_eq!(
            request,
            Request::Run {
                workspace: "/w".into(),
                reads: vec!["/node".into()],
                env: HashMap::from([("HOME".into(), "/w".into()), ("A".into(), "b=c".into())]),
                command: args(&["/node", "--check", "-"]),
            }
        );
    }

    #[test]
    fn rejects_incomplete_or_relative_requests() {
        for bad in [
            &["--workspace", "/w"][..],
            &["--workspace", "/w", "--"],
            &["--", "/node"],
            &["--workspace", "w", "--", "/node"],
            &["--workspace", "/w", "--read", "r", "--", "/node"],
            &["--workspace", "/w", "--env", "NOEQUALS", "--", "/node"],
            &["--network", "on", "--", "/node"],
        ] {
            assert!(parse(&args(bad)).is_err(), "{bad:?}");
        }
    }
}
