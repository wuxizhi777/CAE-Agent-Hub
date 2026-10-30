# Alibaba Cloud Linux 3 部署：公网 IP 访问 CAE 工作台与 CalculiX

**本版对应你的实际系统：Alibaba Cloud Linux 3.2104 U12（OpenAnolis Edition）。使用 `dnf`，不使用 `apt`。主流程直接通过公网 IP 和 4178 端口访问，不要求域名，也不要求 Nginx。**

你已提供的服务器信息：2 核／2 GB；根分区 40 GB，剩余约 22 GB。磁盘空间够当前小案例起步。CPU 架构还需执行 `uname -m` 确认，下面同时处理 x86_64 和 aarch64 的安装包选择。

代码仓库：<https://github.com/wuxizhi777/CAE-Agent-Hub>。编写时核对的源码提交为 `9f50c3bea31c443aa8a4e32d69b2a6870b1ec8b9`。本文命令已做语法检查，**未在你的 ECS 上执行**。

## 1. 你现在应从哪里继续

你当前已用 root 登录，直接执行：

```bash
dnf makecache
dnf install -y git curl ca-certificates tar xz bzip2 util-linux shadow-utils
```

`apt: command not found` 的原因是系统发行版不同，不是没有加 sudo。Alibaba Cloud Linux 3 使用 RPM／DNF 软件包体系。不要安装 apt，不要照 Ubuntu 的包名机械替换成 `dnf install`，也不需要重装系统。

下文按顺序执行。**除标明“自己电脑”的命令外，都在 ECS 的 root 终端执行；不复制 `[root@…]#` 提示符。**服务进程会切换到独立的 `cae` 用户运行。

## 2. 最终访问方式和功能边界

完成后，在自己电脑浏览器中打开：

```text
http://服务器公网IP:4178/cae-workspace/
```

链路为：

```text
浏览器 → ECS 公网 IP:4178 → Node 网页与求解接口
                               → 全局文件锁 → Python → CalculiX ccx
浏览器 → DeepSeek HTTPS API（网页配置 Key 和 Base URL）
```

可以分析工程描述、生成参数草案、运行 CalculiX 悬臂梁静力／5 阶模态并显示结果。其他软件菜单不代表服务器安装了 Abaqus、Fluent 等软件。模型到求解参数的自动映射目前仅支持 CalculiX 悬臂梁。

当前两个模板只有 384 个 C3D8 单元、625 个节点，适合从单作业开始测试；模型物理尺寸变化不会自动增加网格数量。本文不承诺多人并发性能。

此方案利用当前代码中的 Vite preview 中间件运行求解接口，适合**限制访问来源的个人演示／小范围试点**。Vite 官方说明 preview 不是生产服务器，长期课堂服务需要独立后端、用户权限和队列。[Vite 部署说明](https://vite.dev/guide/static-deploy.html)

**当前服务没有登录保护，必须先将安全组的 4178 来源限制为你的公网出口 IP，不能直接对所有人开放。**当前版本源码内还有默认 DeepSeek Key，访问者能够从 JavaScript 读取；收起配置面板不等于隐藏密钥。对外分享前应撤销已暴露 Key、移除默认值，改为网页输入个人 Key。本文不重复密钥。

## 3. 系统、磁盘和网络检查

```bash
cat /etc/os-release
uname -m
free -h
df -h /
command -v dnf
```

确认 `ID=alinux`、`VERSION_ID=3`。根分区当前约 22 GB 剩余，后续运行结果会逐步占用磁盘。

### 3.1 阿里云安全组

在 ECS 控制台 → 实例 → 安全组 → 入方向，增加：

| 协议／端口 | 来源 | 用途 |
| --- | --- | --- |
| TCP 22 | 管理员公网 IP，例如 `203.0.113.10/32`（示例，需替换） | SSH |
| TCP 4178 | 你的电脑或办公室公网出口 IP，使用 `/32` | 网页及求解请求 |

这里填的是访问者的公网出口 IP，不是 ECS 自己的公网 IP，也不是电脑的 `192.168.*` 内网地址。换网络后需要更新规则。当前主流程不用开放 80、443。

若是轻量应用服务器，在对应的防火墙控制台设置同类规则。[阿里云安全组规则](https://www.alibabacloud.com/help/en/ecs/user-guide/security-group-rules)

### 3.2 系统防火墙

先检查，不要为了此项目关闭防火墙：

```bash
systemctl is-active firewalld
```

如果显示 `inactive` 或服务不存在，跳过下列命令；如果是 `active`，先查网卡所属 zone：

```bash
firewall-cmd --get-active-zones
```

若公网网卡属于 `public`，放行如下；如果输出是其他 zone，把 `public` 换成实际名称：

```bash
firewall-cmd --permanent --zone=public --add-port=4178/tcp
firewall-cmd --reload
firewall-cmd --zone=public --query-port=4178/tcp
```

来源限制仍由上面的安全组负责。不要改动现有 SSH 规则，也不要在未确认 SSH 放行的情况下启用一个原本未运行的防火墙。[firewalld 命令说明](https://firewalld.org/documentation/utilities/firewall-cmd.html)

### 3.3 可选：为 2 GB 机器加 Swap

安装环境、构建网页的内存峰值可能高于运行小算例，先检查：

```bash
swapon --show
free -h
```

仅在没有合适 Swap、`/swapfile-cae` 不存在且磁盘空间充足时执行一次：

```bash
fallocate -l 2G /swapfile-cae
chmod 600 /swapfile-cae
mkswap /swapfile-cae
swapon /swapfile-cae
printf '%s\n' '/swapfile-cae none swap sw 0 0' >> /etc/fstab
```

不要重复追加 fstab，不要覆盖已有文件。Swap 是内存峰值的缓冲，不能用来保证重型 CAE 或多人同时求解的性能。

## 4. 安装 Node.js

### 4.1 系统依赖

如果第 1 节已经成功，以下安装可跳过：

```bash
dnf makecache
dnf install -y git curl ca-certificates tar xz bzip2 util-linux shadow-utils
```

若仓库访问失败，检查 `dnf repolist` 和实例网络，不要混入 Ubuntu 或其他发行版的软件源。[阿里云软件源说明](https://help.aliyun.com/en/ecs/user-guide/manage-and-use-linux-software-repositories)

### 4.2 Node 22 官方二进制

当前工程使用 Vite 7，选择 Node 22.12 以上版本。以下自动获取官方 Node 22 系列当前包、校验 SHA256，并安装到 `/opt/node22`。

在 bash 中执行整段。若 `/opt/node22` 已经安装且工作正常，跳过安装，只检查版本：

```bash
(
set -e
case "$(uname -m)" in
  x86_64) NODE_ARCH=x64 ;;
  aarch64) NODE_ARCH=arm64 ;;
  *) echo '本文未覆盖此 CPU 架构'; exit 1 ;;
esac
NODE_STAGE=$(mktemp -d)
cd "$NODE_STAGE"
curl -fSLO https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt
NODE_ARCHIVE=$(awk -v arch="$NODE_ARCH" '$2 ~ "^node-v22\\.[0-9]+\\.[0-9]+-linux-" arch "\\.tar\\.xz$" {print $2}' SHASUMS256.txt)
test -n "$NODE_ARCHIVE"
curl -fSLO "https://nodejs.org/dist/latest-v22.x/$NODE_ARCHIVE"
awk -v name="$NODE_ARCHIVE" '$2 == name' SHASUMS256.txt | sha256sum -c -
install -d -m 755 /opt/node22
tar -xJf "$NODE_ARCHIVE" -C /opt/node22 --strip-components=1
)
export PATH="/opt/node22/bin:$PATH"
node --version
npm --version
```

不要复制本机 macOS 的 Node 或 node_modules 到 Linux。下载失败时可在其他机器下载对应 Linux 安装包和校验文件，再上传 ECS。[Node 下载](https://nodejs.org/en/download)

## 5. 服务用户与源码目录

统一使用以下路径，避免后面的配置随当前 shell 目录变化：

| 路径 | 用途 |
| --- | --- |
| `/opt/cae/CAE-Agent-Hub` | 源码 |
| `/opt/cae/miniforge` | 独立安装的环境管理器 |
| `/opt/cae/runtime` | Python 3.11 和 CalculiX 运行环境 |
| `/opt/cae/bin` | 部署辅助脚本 |
| `/var/lib/cae/runs` | 求解输入、日志和结果 |

首次执行：

```bash
if ! id cae >/dev/null 2>&1; then
  useradd --system --user-group --create-home --home-dir /opt/cae --shell /sbin/nologin cae
fi
install -d -o cae -g cae -m 750 /opt/cae/bin /var/lib/cae /var/lib/cae/runs
runuser -u cae -- git clone https://github.com/wuxizhi777/CAE-Agent-Hub.git /opt/cae/CAE-Agent-Hub
runuser -u cae -- git -C /opt/cae/CAE-Agent-Hub rev-parse HEAD
```

如果目标目录已经是仓库，跳过 clone，先运行 `git status`，不要覆盖本地修改。你原先的 `cae_ai_demo` 目录不需要删除；本文单独使用上述服务目录，不在 `/root` 下运行服务。

## 6. 安装 Python 3.11 和 CalculiX

### 6.1 为什么不直接用系统 Python 或 dnf 安装 ccx

Alibaba Cloud Linux 3 的默认 Python 可能是 3.6，项目要求 Python 3.10 以上；不能只写 `python3` 就假定版本足够。不要更改 `/usr/bin/python3`，系统包管理工具依赖它。[阿里云 Python 说明](https://www.alibabacloud.com/help/en/alinux/support/install-a-newer-python-3-on-alibaba-cloud-linux-3)

本文统一采用 **Miniforge＋conda-forge 独立环境**安装 Python 3.11、CalculiX 和原生库，不依赖 Ubuntu 的 `calculix-ccx` 包，也不假设系统仓库含有同名 RPM。无需另装系统 Python 3.11，环境管理器也不需要作为后台服务常驻。

### 6.2 安装 Miniforge

仅在 `/opt/cae/miniforge` 尚不存在时执行。安装脚本与校验文件均使用已核对的固定版本 `26.9.4-1`，避免两次 latest 请求跨版本。官方只有带版本号的 `.sh.sha256` 资产；不带版本号的安装脚本别名没有对应的校验文件，直接在别名后追加 `.sha256` 会返回 404。[已核对的发布资产](https://github.com/conda-forge/miniforge/releases/expanded_assets/26.9.4-1)

若之前在下载校验文件时遇到 404，`set -e` 已使子 shell 在安装前退出，可以重新执行下面整段；不必重复前面的系统依赖和 Node 安装：

```bash
(
set -e
case "$(uname -m)" in
  x86_64|aarch64) ;;
  *) echo '本文未覆盖此 CPU 架构'; exit 1 ;;
esac
FORGE_STAGE=$(mktemp -d)
cd "$FORGE_STAGE"
FORGE_VERSION="26.9.4-1"
FORGE_FILE="Miniforge3-${FORGE_VERSION}-Linux-$(uname -m).sh"
FORGE_URL="https://github.com/conda-forge/miniforge/releases/download/${FORGE_VERSION}"
curl -fSLO "$FORGE_URL/$FORGE_FILE"
curl -fSLO "$FORGE_URL/$FORGE_FILE.sha256"
sha256sum -c "$FORGE_FILE.sha256"
install -o cae -g cae -m 700 "$FORGE_FILE" /opt/cae/bin/miniforge-installer.sh
runuser -u cae -- env HOME=/opt/cae bash /opt/cae/bin/miniforge-installer.sh -b -p /opt/cae/miniforge
)
```

使用 batch 安装，不执行 `conda init`，不改变 root 或系统的 Python。[Miniforge 官方安装说明](https://github.com/conda-forge/miniforge)

### 6.2.1 下载出现 Empty reply，但之前已下载成功

`curl: (52) Empty reply from server` 表示本次连接未收到有效响应，不能仅凭此错误断定是 GitHub、代理还是网络链路故障。如果第一次无版本号安装包已下载完成，可查找临时目录中的文件，按已核对的 26.9.4-1 官方 SHA256 验证后复用，不必再下载 122 MB。

下面两个哈希对应官方发布资产中的**安装脚本本身**，不是 `.sha256` 文件的哈希：[官方资产与摘要](https://github.com/conda-forge/miniforge/releases/expanded_assets/26.9.4-1)。若原文件属于其他版本，不会匹配，脚本会停止，不会绕过校验。

```bash
(
set -e
case "$(uname -m)" in
  x86_64) FORGE_SHA=571b410272cc434f28bc6c5c49ca8ffd4a4d1bcba9f57f1b6baccdb46446cfcc ;;
  aarch64) FORGE_SHA=1f4e2f1898c054dd35133f778b92794116c28af330e5d5936d56d5f765401db4 ;;
  *) echo '未支持的架构'; exit 1 ;;
esac
FORGE_CACHED=""
while IFS= read -r -d '' candidate; do
  if printf '%s  %s\n' "$FORGE_SHA" "$candidate" | sha256sum -c - >/dev/null 2>&1; then
    FORGE_CACHED="$candidate"
    break
  fi
done < <(find /tmp -maxdepth 2 -type f -name "Miniforge3*Linux-$(uname -m).sh" -print0)
if [ -z "$FORGE_CACHED" ]; then
  echo '未找到校验通过的缓存文件；请使用下方离线传输方式。'
  exit 1
fi
printf '校验通过，复用：%s\n' "$FORGE_CACHED"
install -o cae -g cae -m 700 "$FORGE_CACHED" /opt/cae/bin/miniforge-installer.sh
cd /opt/cae
runuser -u cae -- env HOME=/opt/cae bash /opt/cae/bin/miniforge-installer.sh -b -p /opt/cae/miniforge
)
```

仅在 `/opt/cae/miniforge` 尚未安装时执行，不要删除已有的可用环境。之前命令使用括号子 shell，临时目录变量在退出后不会保留，但下载文件通常仍在 `/tmp`，因此需要上述查找。

若没有完整缓存，可以在网络正常的自己电脑上打开上述官方发布页，下载相同版本、服务器对应架构的 `.sh` 与 `.sh.sha256`，通过 `scp` 上传到服务器 `/tmp/`。在服务器 `cd /tmp` 后运行 `sha256sum -c 对应文件名.sh.sha256`，通过后使用第 6.2 节的 install 和 runuser 命令安装。自己的电脑即使是 Mac，也要下载服务器使用的 Linux 包。不要直接执行校验失败或下载不完整的脚本。

### 6.3 建立运行环境并安装项目依赖

```bash
runuser -u cae -- env HOME=/opt/cae /opt/cae/miniforge/bin/conda create \
  --yes --solver libmamba --override-channels -c conda-forge \
  -p /opt/cae/runtime python=3.11 pip calculix numpy meshio
runuser -u cae -- env HOME=/opt/cae /opt/cae/runtime/bin/python -m pip install \
  'mcp>=1.0,<1.8' 'python-dotenv>=1.0,<2' \
  'pydantic>=2.7.2,<2.11' 'pydantic-settings>=2.5.2,<2.9'
runuser -u cae -- /opt/cae/runtime/bin/python -m pip check
/opt/cae/runtime/bin/python --version
test -x /opt/cae/runtime/bin/ccx
ldd /opt/cae/runtime/bin/ccx
```

`ldd` 不应出现 `not found`。conda-forge 配方将求解器安装为 `bin/ccx`，后面统一使用其绝对路径，不依赖终端激活环境。[CalculiX 包](https://anaconda.org/conda-forge/calculix)、[构建配方](https://github.com/conda-forge/calculix-feedstock/blob/main/recipe/recipe.yaml)

如果 conda 下载慢，检查 GitHub、conda-forge、PyPI 的出站网络；不要关闭 TLS 校验。若创建环境被 OOM 杀死，先处理第 3.3 节 Swap、关闭其他占内存的任务，再重试。若目标环境已存在且验证通过，不重复 create；先检查已有环境内容。

### 6.4 先做真实求解测试

以下调用 Python 桥接脚本，因此参数是平铺结构；后面的 HTTP 接口参数则放在 `parameters` 内。

```bash
runuser -u cae -- env CCX_EXE=/opt/cae/runtime/bin/ccx \
  OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 \
  CAE_WEB_RUN_ROOT=/var/lib/cae/runs \
  /opt/cae/runtime/bin/python /opt/cae/CAE-Agent-Hub/MCP/CalculiX/web_run.py \
  <<'JSON' > /tmp/cae-smoke.json
{"case_id":"calculix-cantilever","analysis":"static","length_mm":120,"width_mm":8,"height_mm":8,"load_n":100,"youngs_modulus_mpa":210000,"poissons_ratio":0.3}
JSON
/opt/cae/runtime/bin/python - <<'PY'
import json
p = json.load(open('/tmp/cae-smoke.json'))
assert p.get('ok') is True, p.get('error', '求解失败')
assert p['summary'].get('status') == 'ok', p['summary']
assert p['result_mesh']['nodes']
print('run_id:', p['run_id'])
print('summary:', p['summary'])
PY
```

成功后应看到新的 run_id 和应力／位移摘要。失败时先查 `/tmp/cae-smoke.json` 内的 error；只有软件安装完成，不等于算例已经求解成功。不同版本数值可以略有差异，仍需检查结果是否有限及符合物理预期。

## 7. 单作业限制与网页构建

### 7.1 创建带文件锁的 Python 启动器

当前后端没有全局排队，利用 `flock` 限制同一时刻只运行一份生成、求解和导出任务：

```bash
cat > /usr/local/bin/cae-calculix-python <<'SH'
#!/bin/sh
exec /usr/bin/flock --nonblock --conflict-exit-code 75 --verbose \
  /var/lib/cae/solver.lock /opt/cae/runtime/bin/python "$@"
SH
chmod 755 /usr/local/bin/cae-calculix-python
```

忙时第二个请求失败，不会自动排队；结束后锁自动释放。不要删除锁文件。直接运行第 6.4 节的脚本会绕过此锁，服务上线后不要并行运行原生测试。

### 7.2 安装前端依赖

```bash
cd /opt/cae/CAE-Agent-Hub/viewer
runuser -u cae -- env HOME=/opt/cae PATH="/opt/node22/bin:$PATH" npm ci
```

保留 devDependencies，当前运行方式需要 Vite。不需要安装 nginx 或 apache。

### 7.3 建立可重复执行的构建／案例发布脚本

工作台会请求 `/models/.../result_mesh.json`。这些文件不是全部自动进入 dist，必须在每次 build 后复制。下面只复制列表中的案例 JSON，不把整个源码仓库作为静态目录。

```bash
cat > /opt/cae/bin/build-viewer.sh <<'SH'
#!/bin/bash
set -euo pipefail
export PATH="/opt/node22/bin:$PATH"
cd /opt/cae/CAE-Agent-Hub/viewer
NODE_OPTIONS=--max-old-space-size=1024 npm run build
/opt/cae/runtime/bin/python - <<'PY'
from pathlib import Path
import shutil
root = Path('/opt/cae/CAE-Agent-Hub')
dist = root / 'viewer/dist'
assert (dist / 'index.html').is_file(), '先完成构建'
cases = [
    'text-to-cae-calculix-cantilever', 'text-to-cae-calculix-modal',
    'text-to-cae-hole-plate', 'text-to-cae-hole-plate-modal', 'text-to-cae',
    'text-to-cae-sphere-impact', 'text-to-cae-milling-3d', 'text-to-cae-gear-mesh',
    'text-to-cae-f22-flow', 'text-to-cae-bullet-plate', 'peridigm-notched-tension',
]
for case in cases:
    for filename in ('result_mesh.json', 'cae_project.json'):
        source = root / 'models' / case / filename
        if not source.is_file():
            print('未收录，跳过:', case, filename)
            continue
        target = dist / 'models' / case / filename
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
for case in cases[:2]:
    assert (dist / 'models' / case / 'result_mesh.json').is_file(), case
print('案例 JSON 已发布到 dist/models')
PY
node --test tests/deepseek.test.mjs
SH
chown cae:cae /opt/cae/bin/build-viewer.sh
chmod 750 /opt/cae/bin/build-viewer.sh
runuser -u cae -- env HOME=/opt/cae /opt/cae/bin/build-viewer.sh
```

看到构建完成、案例文件复制完成和测试通过后再继续。部分其他案例缺少 Git 中未收录的数据会被跳过，不影响两个 CalculiX 案例。

构建时不要同时求解。OOM 时先检查 Swap；也可在性能更好的机器构建同一提交，然后上传产物并在 ECS 上补齐 dist/models。不能直接把 macOS 的 node_modules 上传替代 Linux 依赖安装。

## 8. 先前台启动，通过公网 IP 访问

在服务器执行：

```bash
cd /opt/cae/CAE-Agent-Hub/viewer
runuser -u cae -- env HOME=/opt/cae \
  PATH="/opt/node22/bin:$PATH" \
  CALCULIX_PYTHON=/usr/local/bin/cae-calculix-python \
  CCX_EXE=/opt/cae/runtime/bin/ccx CAE_WEB_RUN_ROOT=/var/lib/cae/runs \
  OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 \
  NODE_OPTIONS=--max-old-space-size=384 \
  /opt/node22/bin/node node_modules/vite/bin/vite.js preview \
  --configLoader native --host 0.0.0.0 --port 4178 --strictPort
```

`0.0.0.0` 用于接收外部连接；不是让你在浏览器输入这个地址。此时终端保持前台占用是正常的，关闭 SSH 或按 Ctrl+C 会停止服务。确认跑通后再按第 10 节配置后台常驻。

另开一个 SSH 终端检查：

```bash
ss -ltnp | grep ':4178'
curl --noproxy '*' -I http://127.0.0.1:4178/cae-workspace/
curl --noproxy '*' -I http://127.0.0.1:4178/models/text-to-cae-calculix-cantilever/result_mesh.json
```

监听应为 `0.0.0.0:4178`，两个 URL 应返回 200。自己电脑浏览器打开：

```text
http://服务器公网IP:4178/cae-workspace/
```

浏览器中的 `127.0.0.1` 代表你自己的电脑，不是 ECS。公网 IP 访问不需要把 Vite allowedHosts 设置成允许所有域名。

## 9. 验收网页、模型与求解

### 9.1 已有结果

页面选择 CalculiX 静力案例，先看已有云图。若空白，浏览器 Network 检查 `/models/.../result_mesh.json`，确认第 7.3 节已执行。

### 9.2 不经模型，直接验证后端求解

在 ECS 的另一个终端执行：

```bash
curl --noproxy '*' -fS http://127.0.0.1:4178/__cae/calculix/run \
  -H 'Content-Type: application/json' \
  --data '{"case_id":"calculix-cantilever","analysis":"static","parameters":{"length_mm":120,"width_mm":8,"height_mm":8,"load_n":100,"youngs_modulus_mpa":210000,"poissons_ratio":0.3}}' \
  -o /tmp/cae-api-smoke.json
/opt/cae/runtime/bin/python - <<'PY'
import json
p = json.load(open('/tmp/cae-api-smoke.json'))
assert p.get('ok') is True, p.get('error')
assert p['summary'].get('status') == 'ok', p['summary']
assert p['result_mesh']['nodes']
print(p['run_id'])
print(p['summary'])
PY
```

再把 `case_id` 改成 `calculix-modal`、`analysis` 改成 `modal` 重复请求，确认有频率结果。模态位移是归一化振型，不是实际载荷下的位移。

### 9.3 DeepSeek 完整流程

网页展开“模型配置”，确认 Base URL 为 `https://api.deepseek.com`，填写有效的 Key 和账户支持的模型名。当前代码默认模型名为 `deepseek-flash`，可修改。无需在服务器写 DeepSeek 的 `.env`。

输入：

> 用 CalculiX 分析矩形钢梁，长 120 mm、宽 8 mm、高 8 mm，弹性模量 210000 MPa、泊松比 0.3，x=0 端固支，另一端面沿 -Z 均布总力 100 N，线弹性静力，输出应力和位移。

点击“用 DeepSeek 分析并生成 CaseSpec”，核对参数、假设和待补充信息，再点击“确认并启动 CalculiX”。应出现新的 run_id 和本次求解结果。

DeepSeek 请求从使用者浏览器发出，不经过 ECS 的 Python 求解进程。HTTPS API 连接失败要检查浏览器网络、模型名、Key 和账户状态，不能仅检查 ECS 是否能联网。[DeepSeek 接口说明](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion/)

### 9.4 文件锁检查

在 ECS 一个终端持有锁 30 秒：

```bash
runuser -u cae -- flock /var/lib/cae/solver.lock sleep 30
```

这期间提交一次 HTTP 求解，应返回失败，不启动另一个 ccx；锁释放后再提交应成功。当前界面可能显示 HTTP 500／锁冲突信息，这不是已实现的任务队列。

## 10. systemd 后台运行、退出 SSH 不停止

先在第 8 节的前台窗口按 Ctrl+C，确认 4178 已释放，避免启动两个服务。

```bash
cat > /etc/systemd/system/cae-workspace.service <<'UNIT'
[Unit]
Description=CAE workspace pilot CalculiX API
After=network.target

[Service]
Type=simple
User=cae
Group=cae
WorkingDirectory=/opt/cae/CAE-Agent-Hub/viewer
Environment=HOME=/opt/cae
Environment=PATH=/opt/node22/bin:/usr/local/bin:/usr/bin:/bin
Environment=NODE_ENV=production
Environment=CALCULIX_PYTHON=/usr/local/bin/cae-calculix-python
Environment=CCX_EXE=/opt/cae/runtime/bin/ccx
Environment=CAE_WEB_RUN_ROOT=/var/lib/cae/runs
Environment=OMP_NUM_THREADS=1
Environment=OPENBLAS_NUM_THREADS=1
Environment=MKL_NUM_THREADS=1
Environment=NODE_OPTIONS=--max-old-space-size=384
ExecStart=/opt/node22/bin/node /opt/cae/CAE-Agent-Hub/viewer/node_modules/vite/bin/vite.js preview --configLoader native --host 0.0.0.0 --port 4178 --strictPort
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
KillMode=control-group
MemoryAccounting=true
MemoryMax=1400M
TasksMax=128
UMask=0027
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/var/lib/cae

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now cae-workspace
systemctl status cae-workspace --no-pager
ss -ltnp | grep ':4178'
```

配置中的 `--configLoader native` 直接加载现有 `.mjs` 文件，避免 Vite 默认配置加载器向只读源码目录写入 `.vite-temp`。环境路径全部使用绝对路径，不依赖 root 是否执行了 conda activate。

1400 MB 为服务及其子进程的内存上限，不是实际占用估计；是否生效应检查当前系统的 cgroup 支持和 systemd 属性。它不能替代单作业限制。更大模型可能触发 OOM，不能仅提高上限后继续往 2 GB 机器里堆作业。

```bash
systemctl show cae-workspace -p MemoryCurrent -p MemoryMax -p TasksCurrent
journalctl -u cae-workspace -n 80 --no-pager
```

如果日志出现权限错误，不要直接改成 root 运行；先核对 `/var/lib/cae` 的所有者、程序路径和具体被拒绝的操作。

## 11. 常见问题：按你的系统排查

| 现象 | 处理 |
| --- | --- |
| `apt: command not found` | 当前系统使用 dnf，从第 1 节开始，不需要 sudo apt |
| `sudo: command not found` | 本文已按 root 编写，不依赖 sudo；切换服务用户用 runuser |
| `No match for argument: calculix-ccx` | 不用 Ubuntu 包名；按第 6 节用 conda-forge 安装 |
| 系统 `python3 --version` 显示 3.6 | 正常，勿替换系统 Python；本项目使用 `/opt/cae/runtime/bin/python` |
| conda create 内存耗尽 | 查看 OOM 日志，先加 Swap 并停止其他耗内存任务；不要同时构建 |
| Miniforge 的 `.sha256` 返回 404 | 按第 6.2 节使用带版本号的安装包与校验文件，不能给无版本号别名直接追加 `.sha256` |
| `curl: (52) Empty reply from server` | 若之前已下载成功，按第 6.2.1 节校验并复用缓存；否则从自己电脑下载官方包再上传 |
| GitHub 下载超时 | 检查出站网络；可以从可信机器下载相同架构的安装包和校验文件上传 |
| `ccx: error while loading shared libraries` | 检查 runtime 内的 ccx 和 ldd 输出；不要只复制一个 ccx 可执行文件，保留整个 Conda 环境 |
| 本机 curl 200，公网超时 | 检查安全组来源 IP、4178 放行、firewalld 和是否监听 0.0.0.0 |
| 只监听 127.0.0.1 | 检查启动命令中是否有 `--host 0.0.0.0` |
| 网页 200，云图 JSON 404 | 重新执行 build-viewer.sh，确认 dist/models 中已有文件 |
| 找不到 package.json | 命令应在 `/opt/cae/CAE-Agent-Hub/viewer` 执行 |
| 找不到 vite | 执行 npm ci，不能省略 devDependencies |
| 端口已占用 | 用 ss 查看，通常是第 8 节前台进程尚未退出，不要盲目 kill 所有 Node |
| systemd 203/EXEC | 检查 `/opt/node22/bin/node` 路径、架构、执行权限及 SELinux 拒绝日志 |
| 求解失败提示 lock | 已有作业运行，等它结束再提交；不要删除锁文件 |
| 运行结果目录只读 | 检查 CAE_WEB_RUN_ROOT 是否指向 `/var/lib/cae/runs` |
| `Killed`／服务重启 | `journalctl -k` 检查 OOM，核对实际内存与 systemd 上限 |
| DeepSeek Key 无效／余额不足 | 在网页修正配置和账户状态，不需要重装 CalculiX |
| API 在浏览器连接失败 | 使用者的网络或 API 跨域问题，检查浏览器 Network；请求不由 ECS 代发 |

SELinux 相关问题先运行 `getenforce`，若 Enforcing 且有明确拒绝，可查看 `ausearch -m AVC -ts recent`（需系统提供该工具），按日志修正文件标签或策略。不要默认关闭 SELinux。当前直接 Node 服务不需要配置 Nginx 的 SELinux 规则。

运行与维护命令：

```bash
systemctl status cae-workspace --no-pager
journalctl -u cae-workspace -f
free -h
ps -eo pid,ppid,comm,rss,%cpu --sort=-rss | head -15
du -sh /var/lib/cae/runs
```

RSS 通常以 KB 显示。每次作业在 runs 下创建独立目录，当前无自动清理；先备份需要保留的输入、日志和结果，再清理已结束且不需要的具体目录，不在求解中删除整个 runs。

## 12. 更新代码

先选没有作业的维护窗口，记录旧提交并检查本地修改：

```bash
runuser -u cae -- git -C /opt/cae/CAE-Agent-Hub status --short
runuser -u cae -- git -C /opt/cae/CAE-Agent-Hub rev-parse HEAD
```

确认工作区没有需要保留的修改后：

```bash
systemctl stop cae-workspace
runuser -u cae -- git -C /opt/cae/CAE-Agent-Hub pull --ff-only
cd /opt/cae/CAE-Agent-Hub/viewer
runuser -u cae -- env HOME=/opt/cae PATH="/opt/node22/bin:$PATH" npm ci
runuser -u cae -- env HOME=/opt/cae /opt/cae/bin/build-viewer.sh
systemctl start cae-workspace
systemctl status cae-workspace --no-pager
```

每条命令成功后再继续；拉取或构建失败时不要当作发布成功。`build-viewer.sh` 会重新构建并复制案例文件。更新不会删除 `/var/lib/cae/runs`。

如果在服务器修改了默认 Key 等源码，先保存修改，再人工合并；不要用 `git reset --hard` 强行拉取。回滚应使用记录的旧提交及匹配的依赖重新构建，并再次执行第 9 节验收。

## 13. 可选：移除前端默认 Key

个人 IP 限制并不能撤销已经公开到 Git 的 Key；旧 Key 应在 DeepSeek 控制台撤销，改用个人 Key。

如需把这台服务器构建中的默认 Key 清空，可在 build 前执行下面脚本，保留网页输入与保存功能：

```bash
runuser -u cae -- /opt/cae/runtime/bin/python - <<'PY'
from pathlib import Path
import re
p = Path('/opt/cae/CAE-Agent-Hub/viewer/lib/deepseek.mjs')
s, count = re.subn(r'apiKey:\s*"[^"\n]*"', 'apiKey: ""', p.read_text(), count=1)
assert count == 1, '配置结构变化，请人工核对'
p.write_text(s)
print('已清空默认值，未输出原密钥；需要重新构建')
PY
```

重新构建后在网页填写新 Key。“保存配置”存到当前标签页的 sessionStorage，不是服务器配置文件；换 IP、端口、域名或协议后需要重新填写。建议在开发仓库也清空默认值并推送，避免下次更新重新引入。

## 14. 可选：什么时候再加 Nginx／HTTPS

**公网 IP 访问不需要 Nginx。**等你需要域名、HTTPS、访问密码、静态资源分离，或者准备向更多用户提供服务时再配置。

届时 Alibaba Cloud Linux 3 的命令与路径是：

```bash
dnf install -y nginx httpd-tools
nginx -t
```

站点通常放 `/etc/nginx/conf.d/cae-workspace.conf`，不是 Ubuntu 的 sites-available/sites-enabled；运行用户以 `/etc/nginx/nginx.conf` 的 `user` 指令为准，不能照搬 `www-data`。反向代理接入后应将 Node 改回 `127.0.0.1:4178`，撤销公网 4178 放行，只公开所需的 80／443。具体站点配置和证书需要结合实际域名另行设置，**不要只安装 Nginx 就认为已获得 HTTPS 或访问保护**。[阿里云 Nginx 部署参考](https://help.aliyun.com/zh/ecs/user-guide/deploy-the-lnmp-environment)

当前公网 IP＋HTTP 方案只用于来源受限的临时测试，不在不可信网络长期传递登录信息或使用共享密钥。无需域名而希望加密测试访问时，可将服务改为只监听回环，再用 SSH 本地端口转发；这不是本文直接公网访问的必做步骤。

## 15. 本文验证范围

已核对：你贴出的 Alibaba Cloud Linux 3 系统信息、原源码的网页入口和 API、CalculiX 模板规模、绝对路径配置、Conda 包安装方式；已检查文档内 shell／Python 语法及本地文档链接。

未执行：ECS 实机安装、Conda 在这台 2 GB 机器上的依赖解析与运行、公网访问、账户余额检查、Ubuntu 或 Alibaba Cloud Linux 上的真实部署验收。以第 6.4 节和第 9 节的实测结果作为成功依据。

相关设计：[教学平台方案](ai-cae-case-teaching-platform.zh-CN.md)、[MCP 软件接入清单](cae-mcp-integration-inventory.zh-CN.md)。
