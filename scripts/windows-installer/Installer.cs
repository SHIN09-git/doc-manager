using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Windows.Forms;

namespace MowenNibiInstaller
{
    internal sealed class InstallResult
    {
        public bool Success;
        public string Message;
        public string LogPath;
    }

    internal static class Program
    {
        [STAThread]
        private static int Main()
        {
            if (String.Equals(Environment.GetEnvironmentVariable("MOWEN_INSTALLER_SILENT"), "1", StringComparison.Ordinal))
            {
                return InstallerEngine.Install().Success ? 0 : 1;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new InstallerForm());
            return 0;
        }
    }

    internal sealed class InstallerForm : Form
    {
        private readonly Label titleLabel;
        private readonly Label statusLabel;
        private readonly ProgressBar progressBar;
        private readonly Button closeButton;

        public InstallerForm()
        {
            Text = "摹文拟笔工作台安装程序";
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ClientSize = new Size(520, 190);
            BackColor = Color.FromArgb(247, 249, 252);

            titleLabel = new Label();
            titleLabel.Text = "正在安装摹文拟笔工作台";
            titleLabel.Font = new Font("Microsoft YaHei UI", 15F, FontStyle.Bold);
            titleLabel.ForeColor = Color.FromArgb(31, 45, 61);
            titleLabel.AutoSize = true;
            titleLabel.Location = new Point(30, 24);

            statusLabel = new Label();
            statusLabel.Text = "正在复制运行文件并创建快捷方式，请稍候。";
            statusLabel.Font = new Font("Microsoft YaHei UI", 9F);
            statusLabel.ForeColor = Color.FromArgb(83, 96, 112);
            statusLabel.AutoEllipsis = true;
            statusLabel.Location = new Point(32, 66);
            statusLabel.Size = new Size(456, 42);

            progressBar = new ProgressBar();
            progressBar.Style = ProgressBarStyle.Marquee;
            progressBar.MarqueeAnimationSpeed = 24;
            progressBar.Location = new Point(34, 112);
            progressBar.Size = new Size(452, 12);

            closeButton = new Button();
            closeButton.Text = "关闭";
            closeButton.Enabled = false;
            closeButton.Size = new Size(86, 30);
            closeButton.Location = new Point(400, 142);
            closeButton.Click += delegate { Close(); };

            Controls.Add(titleLabel);
            Controls.Add(statusLabel);
            Controls.Add(progressBar);
            Controls.Add(closeButton);
            Shown += OnInstallerShown;
        }

        private void OnInstallerShown(object sender, EventArgs args)
        {
            BackgroundWorker worker = new BackgroundWorker();
            worker.DoWork += delegate(object workerSender, DoWorkEventArgs workerArgs)
            {
                workerArgs.Result = InstallerEngine.Install();
            };
            worker.RunWorkerCompleted += delegate(object workerSender, RunWorkerCompletedEventArgs workerArgs)
            {
                InstallResult result = workerArgs.Error == null
                    ? (InstallResult)workerArgs.Result
                    : new InstallResult { Success = false, Message = workerArgs.Error.Message, LogPath = "" };
                progressBar.Style = ProgressBarStyle.Continuous;
                progressBar.Value = result.Success ? 100 : 0;
                closeButton.Enabled = true;
                if (result.Success)
                {
                    titleLabel.Text = "安装完成";
                    statusLabel.Text = "桌面和开始菜单快捷方式已创建，工作台正在启动。";
                    closeButton.Text = "完成";
                }
                else
                {
                    titleLabel.Text = "安装未完成";
                    statusLabel.Text = result.Message + (String.IsNullOrEmpty(result.LogPath) ? "" : "\r\n日志：" + result.LogPath);
                    statusLabel.ForeColor = Color.FromArgb(166, 49, 55);
                }
            };
            worker.RunWorkerAsync();
        }
    }

    internal static class InstallerEngine
    {
        private const string ResourceName = "MowenNibi.Package.zip";

        public static InstallResult Install()
        {
            string installRoot = Environment.GetEnvironmentVariable("MOWEN_INSTALL_ROOT");
            if (String.IsNullOrWhiteSpace(installRoot))
            {
                installRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MowenNibiWorkbench");
            }
            Directory.CreateDirectory(installRoot);
            string logPath = Path.Combine(installRoot, "installer.log");
            string tempRoot = Path.Combine(Path.GetTempPath(), "MowenNibiInstaller-" + Guid.NewGuid().ToString("N"));
            StringBuilder log = new StringBuilder();
            log.AppendLine("Installer started at " + DateTime.UtcNow.ToString("O"));

            try
            {
                Directory.CreateDirectory(tempRoot);
                ExtractEmbeddedPackage(tempRoot);
                string[] scripts = Directory.GetFiles(tempRoot, "install.ps1", SearchOption.AllDirectories);
                if (scripts.Length != 1)
                {
                    throw new InvalidOperationException("安装资源不完整：未找到唯一的 install.ps1。请重新下载安装包。");
                }

                RunPowerShell(scripts[0], log);
                log.AppendLine("Installer completed successfully.");
                File.WriteAllText(logPath, log.ToString(), new UTF8Encoding(true));
                return new InstallResult { Success = true, Message = "安装完成", LogPath = logPath };
            }
            catch (Exception error)
            {
                log.AppendLine(error.ToString());
                try { File.WriteAllText(logPath, log.ToString(), new UTF8Encoding(true)); } catch { }
                return new InstallResult { Success = false, Message = error.Message, LogPath = logPath };
            }
            finally
            {
                try { if (Directory.Exists(tempRoot)) Directory.Delete(tempRoot, true); } catch { }
            }
        }

        private static void ExtractEmbeddedPackage(string destination)
        {
            Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream(ResourceName);
            if (resource == null)
            {
                throw new InvalidOperationException("安装程序缺少内置资源，请重新下载安装包。");
            }

            string safeRoot = Path.GetFullPath(destination + Path.DirectorySeparatorChar);
            using (resource)
            using (ZipArchive archive = new ZipArchive(resource, ZipArchiveMode.Read, false))
            {
                foreach (ZipArchiveEntry entry in archive.Entries)
                {
                    string relative = entry.FullName.Replace('/', Path.DirectorySeparatorChar);
                    string target = Path.GetFullPath(Path.Combine(destination, relative));
                    if (!target.StartsWith(safeRoot, StringComparison.OrdinalIgnoreCase))
                    {
                        throw new InvalidOperationException("安装资源包含不安全路径。");
                    }
                    if (String.IsNullOrEmpty(entry.Name))
                    {
                        Directory.CreateDirectory(target);
                        continue;
                    }

                    string parent = Path.GetDirectoryName(target);
                    if (!String.IsNullOrEmpty(parent)) Directory.CreateDirectory(parent);
                    using (Stream input = entry.Open())
                    using (FileStream output = new FileStream(target, FileMode.Create, FileAccess.Write, FileShare.None))
                    {
                        input.CopyTo(output);
                    }
                }
            }
        }

        private static void RunPowerShell(string scriptPath, StringBuilder log)
        {
            ProcessStartInfo startInfo = new ProcessStartInfo();
            startInfo.FileName = Path.Combine(Environment.SystemDirectory, "WindowsPowerShell", "v1.0", "powershell.exe");
            startInfo.Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + scriptPath + "\"";
            startInfo.WorkingDirectory = Path.GetDirectoryName(scriptPath);
            startInfo.UseShellExecute = false;
            startInfo.CreateNoWindow = true;
            startInfo.RedirectStandardOutput = true;
            startInfo.RedirectStandardError = true;
            using (Process process = new Process())
            {
                process.StartInfo = startInfo;
                process.Start();
                string standardOutput = process.StandardOutput.ReadToEnd();
                string standardError = process.StandardError.ReadToEnd();
                process.WaitForExit();
                log.AppendLine(standardOutput);
                log.AppendLine(standardError);
                log.AppendLine("PowerShell exit code: " + process.ExitCode);
                if (process.ExitCode != 0)
                {
                    string detail = String.IsNullOrWhiteSpace(standardError) ? standardOutput : standardError;
                    throw new InvalidOperationException("安装脚本执行失败。" + Environment.NewLine + detail.Trim());
                }
            }
        }
    }
}
