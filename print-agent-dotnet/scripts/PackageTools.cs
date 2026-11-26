using System;
using System.IO;
using System.IO.Compression;
using System.Net;

internal static class PackageTools
{
    private static int Main(string[] args)
    {
        try
        {
            if (args.Length == 3 && String.Equals(args[0], "download", StringComparison.OrdinalIgnoreCase))
            {
                Download(args[1], args[2]);
                return 0;
            }

            if (args.Length == 3 && String.Equals(args[0], "extract", StringComparison.OrdinalIgnoreCase))
            {
                Extract(args[1], args[2]);
                return 0;
            }

            if (args.Length == 3 && String.Equals(args[0], "zip", StringComparison.OrdinalIgnoreCase))
            {
                CreateZip(args[1], args[2]);
                return 0;
            }

            Console.Error.WriteLine("Usage: PackageTools.exe <download|extract|zip> <path> <path>");
            return 2;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex.Message);
            return 1;
        }
    }

    private static void Download(string url, string destination)
    {
        ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072;
        using (var client = new WebClient())
        {
            client.DownloadFile(url, destination);
        }
    }

    private static void Extract(string archivePath, string destination)
    {
        var root = Path.GetFullPath(destination).TrimEnd(
            Path.DirectorySeparatorChar,
            Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
        Directory.CreateDirectory(root);

        using (var file = File.OpenRead(archivePath))
        using (var archive = new ZipArchive(file, ZipArchiveMode.Read))
        {
            foreach (var entry in archive.Entries)
            {
                var target = Path.GetFullPath(Path.Combine(root, entry.FullName));
                if (!target.StartsWith(root, StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidDataException("Archive contains an invalid path.");
                }

                if (String.IsNullOrEmpty(entry.Name))
                {
                    Directory.CreateDirectory(target);
                    continue;
                }

                var directory = Path.GetDirectoryName(target);
                if (!String.IsNullOrEmpty(directory))
                {
                    Directory.CreateDirectory(directory);
                }

                using (var input = entry.Open())
                using (var output = File.Create(target))
                {
                    input.CopyTo(output);
                }
            }
        }
    }

    private static void CreateZip(string sourceDirectory, string archivePath)
    {
        var root = Path.GetFullPath(sourceDirectory).TrimEnd(
            Path.DirectorySeparatorChar,
            Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
        var outputPath = Path.GetFullPath(archivePath);
        if (File.Exists(outputPath))
        {
            File.Delete(outputPath);
        }

        using (var output = File.Create(outputPath))
        using (var archive = new ZipArchive(output, ZipArchiveMode.Create))
        {
            foreach (var filePath in Directory.GetFiles(root, "*", SearchOption.AllDirectories))
            {
                var fullPath = Path.GetFullPath(filePath);
                if (String.Equals(fullPath, outputPath, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var entryName = fullPath.Substring(root.Length).Replace('\\', '/');
                var entry = archive.CreateEntry(entryName, CompressionLevel.Optimal);
                using (var input = File.OpenRead(fullPath))
                using (var destination = entry.Open())
                {
                    input.CopyTo(destination);
                }
            }
        }
    }
}
