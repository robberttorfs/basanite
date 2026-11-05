// Shell guards: read commands stay allowed, real writes and risky commands are caught.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const guards = require('../src/main/guards');
const { parse } = require('../src/main/shellparse');

const ro = (c, tool = 'Bash') => guards.check('readonly', 'Review', tool, { command: c });
const careful = (c, tool = 'Bash') => guards.check('risky', 'Careful', tool, { command: c });

test('shellparse: quotes, operators, redirections and heredocs', () => {
  const p = (c, f) => parse(c, f).map((s) => [s.words.map((w) => w.text).join(' '), s.redirects.map((r) => r.op + r.target).join(','), s.heredoc]);
  assert.deepEqual(p('echo x > a.txt'), [['echo x', '>a.txt', '']]);
  assert.deepEqual(p('cat x 2>/dev/null'), [['cat x', '>/dev/null', '']]);
  assert.deepEqual(p("awk '$1 > 5' f"), [['awk $1 > 5 f', '', '']]);
  assert.deepEqual(p('a && b | c; d || e & f').map((x) => x[0]), ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.deepEqual(p('cat > f <<EOF\nrm x\nEOF\nls'), [['cat', '>f', 'rm x\n'], ['ls', '', '']]);
  assert.deepEqual(p('x=$(rm a) && echo $((1>2))').map((x) => x[0]), ['x=', 'rm a', 'echo $((1>2))']);
  assert.deepEqual(p('cmd 2>&1 >out'), [['cmd', '>&1,>out', '']]);
  assert.deepEqual(p('find . -exec rm {} \\;'), [['find . -exec rm {} ;', '', '']]);
  assert.deepEqual(p('Get-X 2>$null', 'ps'), [['Get-X', '>$null', '']]);
  assert.deepEqual(p('dir C:\\tmp', 'ps'), [['dir C:\\tmp', '', '']]);
  assert.deepEqual(p('echo "a \\"b\\" c" # rm x'), [['echo a "b" c', '', '']]);
});

test('guards: the reported false positives are allowed', () => {
  // Review / Plan (read-only)
  for (const c of [
    'git stash list', 'git stash show -p', 'git tag -l', 'git tag', 'git tag -l "v*"', 'git tag --contains HEAD',
    'grep -rn "<div>" src', "awk '$1 > 5' f", 'node -e "console.log(a>b)"', 'python -c "print(len(x)>2)"',
    'grep -rn "git push" docs', 'rg "delete from" -i src', 'ls --force',
  ]) assert.equal(ro(c), null, c);
  // Careful
  for (const c of ['rg "delete from" -i src', 'ls --force', 'grep -rn "git push" docs', 'echo "rm -rf /"', "git log --grep='push --force'"]) assert.equal(careful(c), null, c);
});

test('guards: other read commands stay allowed', () => {
  for (const c of [
    'ls -la', 'git status', 'git diff', 'git log --oneline -5', 'git -C sub status', 'git branch', 'git branch -a', 'git branch --show-current',
    'git branch --contains abc', 'git worktree list', 'git apply --check p.diff', 'npm test', 'npm run build', 'cat x 2>/dev/null', 'cmd 2>&1 | head',
    'echo hi >/dev/null', 'grep -r install .', 'node -e "a=>1"', 'cat a | grep -v "x > y" | wc -l', 'sed -n 1,5p f', 'sed -E "s/a/b/" f',
    'perl -ne "print if /x/" f', 'find . -name "*.js"', 'find . -exec grep -l x {} \\;', 'xargs -n 1 echo', 'curl -s https://x.y',
    'curl -o /dev/null -s -w "%{http_code}" https://x.y', 'wget -qO- https://x.y', 'echo $((3 > 2))', '[[ "$a" > "$b" ]] && echo y',
    'for f in *.js; do wc -l "$f"; done', 'yarn test', 'pip list', 'python -m pip list', 'tee', 'docker ps', 'gh pr view 3',
    'psql -c "SELECT * FROM users"', 'bash -c "ls -la"',
  ]) assert.equal(ro(c), null, c);
  for (const c of ['Get-ChildItem C:\\x 2>$null', 'Get-Content a.txt | Select-String "x > y"', 'dir > nul', 'Get-Process | Out-Null']) assert.equal(ro(c, 'PowerShell'), null, c);
});

test('guards: real writes are blocked in read-only modes', () => {
  for (const c of [
    'echo x > a.txt', 'echo x >> a.txt', 'cat a &> log.txt', 'ls >| out', 'cmd 2> err.log', 'rm a', 'mv a b', 'cp a b', 'mkdir d', 'touch f',
    'sudo rm a', 'FOO=1 rm a', 'env A=1 rm a', 'timeout 5 rm a', 'ls | xargs rm', 'ls | xargs -n 1 rm', '/bin/rm a', 'echo y | tee out.txt',
    'sed -i s/a/b/ f', 'sed -Ei s/a/b/ f', 'sed --in-place s/a/b/ f', 'perl -pi -e s/a/b/ f', 'git commit -m x', 'git -C sub add .',
    'git stash', 'git stash pop', 'git tag v1.0', 'git tag -d v1', 'git branch feature', 'git branch -d old', 'git worktree add ../w',
    'git apply p.diff', 'npm install left-pad', 'npm i', 'pnpm add x', 'yarn', 'pip install x', 'python -m pip install x', 'uv pip install x',
    'cargo add serde', 'brew install jq', 'find . -delete', 'find . -name "*.tmp" -exec rm {} \\;', 'bash -c "rm a"', 'sh -c \'echo x > f\'',
    'eval "rm a"', 'ls && rm a', 'ls; rm a', 'x=$(rm a)', 'echo `rm a`', 'cat > f <<EOF\nhi\nEOF', 'curl -o out.html https://x.y',
    'curl -O https://x.y/f.zip', 'wget https://x.y/f.zip', 'cmd /c del a.txt', 'git push', 'dd if=/dev/zero of=f',
  ]) assert.ok(ro(c), c);
  for (const c of ['Set-Content a b', 'Get-Content a | Out-File b', 'New-Item x', 'ri x', 'echo x > a.txt', 'Remove-Item x -Recurse', 'pwsh -Command "Remove-Item x"']) assert.ok(ro(c, 'PowerShell'), c);
});

test('guards: risky commands are blocked in Careful, local writes are not', () => {
  for (const c of [
    'git push origin main', 'git push --force', 'git -C x push', 'git reset --hard HEAD~1', 'git clean -fd', 'git checkout -- .', 'git restore .',
    'git branch -D old', 'rm -rf build', 'rm -fr build', 'rm -r -f build', 'rm --recursive --force build', 'sudo rm -rf /x', 'vercel deploy --prod',
    'netlify deploy', 'npm publish', 'cargo publish', 'twine upload dist/*', 'docker push img', 'kubectl apply -f x.yaml', 'terraform destroy',
    'gh pr merge 3', 'gh release create v1', 'pkill node', 'taskkill /IM node.exe /F', 'psql -c "DROP TABLE users"', 'psql -c "delete from users"',
    'psql <<SQL\nDELETE FROM users;\nSQL', 'bash -c "git push"', 'ls && git push', 'rd /s /q build',
  ]) assert.ok(careful(c), c);
  assert.ok(careful('Remove-Item build -Recurse -Force', 'PowerShell'));
  assert.ok(careful('rm build -r', 'PowerShell'));
  for (const c of ['git commit -m ok', 'rm a.txt', 'rm -f a.txt', 'echo x > a', 'npm install', 'git reset HEAD a', 'git clean -n', 'git checkout main', 'taskkill /PID 12']) {
    assert.equal(careful(c), null, c);
  }
});
