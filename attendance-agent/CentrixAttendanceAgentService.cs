using System;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;
using System.Threading;

namespace Centrix
{
    public class AttendanceAgentService : ServiceBase
    {
        public const string Name = "CentrixAttendanceAgent";

        Thread worker;
        volatile bool stopping;
        Process child;
        readonly object gate = new object();
        string workDir;
        string nodeExe;
        string agentJs;
        string logDir;

        public AttendanceAgentService()
        {
            ServiceName = Name;
            CanStop = true;
            CanShutdown = true;
            AutoLog = true;
        }

        protected override void OnStart(string[] args)
        {
            workDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
            agentJs = Path.Combine(workDir, "agent.js");
            logDir = Path.Combine(workDir, "logs");
            Directory.CreateDirectory(logDir);

            nodeExe = ReadNodePath();
            if (string.IsNullOrEmpty(nodeExe) || !File.Exists(nodeExe))
            {
                throw new InvalidOperationException("Node.js was not found. Install Node 20+ and re-run install-windows.bat.");
            }
            if (!File.Exists(agentJs))
            {
                throw new InvalidOperationException("agent.js was not found in " + workDir);
            }

            stopping = false;
            worker = new Thread(KeepAlive) { IsBackground = true, Name = Name };
            worker.Start();
            Log("service started using " + nodeExe);
        }

        protected override void OnStop()
        {
            stopping = true;
            KillChild();
            if (worker != null && !worker.Join(12000))
            {
                Log("worker thread did not stop in time");
            }
            Log("service stopped");
        }

        void KeepAlive()
        {
            while (!stopping)
            {
                try
                {
                    StartChild();
                    Process running;
                    lock (gate) { running = child; }
                    if (running != null)
                    {
                        running.WaitForExit();
                    }
                }
                catch (Exception ex)
                {
                    Log("agent error: " + ex.Message);
                }

                if (stopping) break;
                Log("agent exited; restarting in 5s");
                Thread.Sleep(5000);
            }
        }

        void StartChild()
        {
            KillChild();
            var psi = new ProcessStartInfo();
            psi.FileName = nodeExe;
            psi.Arguments = "\"" + agentJs + "\"";
            psi.WorkingDirectory = workDir;
            psi.UseShellExecute = false;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            psi.CreateNoWindow = true;

            var nodeDir = Path.GetDirectoryName(nodeExe);
            if (!string.IsNullOrEmpty(nodeDir))
            {
                var path = Environment.GetEnvironmentVariable("PATH") ?? "";
                psi.EnvironmentVariables["PATH"] = nodeDir + Path.PathSeparator + path;
            }

            var proc = new Process();
            proc.StartInfo = psi;
            proc.EnableRaisingEvents = true;
            proc.OutputDataReceived += delegate(object s, DataReceivedEventArgs e) { Log(e.Data); };
            proc.ErrorDataReceived += delegate(object s, DataReceivedEventArgs e) { Log(e.Data); };
            if (!proc.Start())
            {
                throw new InvalidOperationException("Could not start Node.js.");
            }
            proc.BeginOutputReadLine();
            proc.BeginErrorReadLine();
            lock (gate) { child = proc; }
        }

        void KillChild()
        {
            Process proc;
            lock (gate)
            {
                proc = child;
                child = null;
            }
            if (proc == null) return;
            try
            {
                if (!proc.HasExited)
                {
                    proc.Kill();
                    proc.WaitForExit(8000);
                }
            }
            catch
            {
            }
            try { proc.Dispose(); } catch { }
        }

        string ReadNodePath()
        {
            try
            {
                var listed = Path.Combine(workDir, "node-exe.txt");
                if (File.Exists(listed))
                {
                    var line = File.ReadAllText(listed).Trim().Trim('"');
                    if (File.Exists(line)) return line;
                }
            }
            catch { }

            var env = Environment.GetEnvironmentVariable("CENTRIX_NODE_EXE");
            if (!string.IsNullOrEmpty(env) && File.Exists(env)) return env;

            var pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            var candidates = new string[]
            {
                Path.Combine(pf, "nodejs", "node.exe"),
                @"C:\Program Files\nodejs\node.exe",
                @"C:\Program Files (x86)\nodejs\node.exe"
            };
            for (var i = 0; i < candidates.Length; i++)
            {
                if (File.Exists(candidates[i])) return candidates[i];
            }

            var path = Environment.GetEnvironmentVariable("PATH") ?? "";
            var parts = path.Split(Path.PathSeparator);
            for (var i = 0; i < parts.Length; i++)
            {
                try
                {
                    var p = Path.Combine(parts[i].Trim(), "node.exe");
                    if (File.Exists(p)) return p;
                }
                catch { }
            }
            return null;
        }

        void Log(string line)
        {
            if (string.IsNullOrEmpty(line)) return;
            try
            {
                File.AppendAllText(
                    Path.Combine(logDir, "service.log"),
                    DateTime.Now.ToString("s") + " " + line + Environment.NewLine);
            }
            catch { }
        }

        public static void Main()
        {
            ServiceBase.Run(new AttendanceAgentService());
        }
    }
}
