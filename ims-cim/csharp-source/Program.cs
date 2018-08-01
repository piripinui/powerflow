using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Runtime.InteropServices;
using System.Net;
using OpenDSSengine;

namespace PowerFlow
{
    class Program
    {
        public static DSS dss;
        public static Text DSSText;
        public static Solution DSSSolution;
        public static string filePath;
        public static string resultPath;
        public static Circuit DSSCircuit;

        static void Main(string[] args)
        {
            
            if (args.Length > 0)
            {
                //Console.WriteLine("Starting OpenDSS...");
                filePath = args[0];
                resultPath = args[1];

                SimpleHTTPServer myServer = new SimpleHTTPServer(filePath, 3001);
                Console.WriteLine("Server is running on this port: " + myServer.Port.ToString());

                try
                {
                    dss = new DSS();
                    if (!(dss.Start(0)))
                    {
                        Console.WriteLine("OpenDSS failed to start");
                    }
                    else
                    {
                        //Console.WriteLine("OpenDSS started successfully");
                        DSSText = dss.Text;
                    }
                }
                catch (Exception e)
                {
                    Console.WriteLine(e.Message);
                }
            }
            else
            {
                Console.WriteLine("Error: DSS file parameter is required (e.g. \"powerflow.exe myfile.dss <result_dir>\").");
            }
        }

        public static void loadCircuit()
        {
            Console.WriteLine("Loading circuit from " + filePath);

            DSSText.Command = "clear";
            DSSText.Command = @"compile (" + filePath + ")";

            Console.WriteLine("Circuit loaded.");

            DSSCircuit = dss.ActiveCircuit;
            DSSSolution = DSSCircuit.Solution;

            DSSSolution.Solve();
            if (DSSSolution.Converged)
            {
                // This will raise a file called <Circuit Name>_VLN_Node.txt in the directory where the DSS file
                // was read from in the default editor (Notepad usually). This means that every time an analysis
                // is run, editors will pop up on the server - need to figure out how to get rid of them.
                //DSSText.Command = "Show Voltages LN Nodes";

                string vFile = resultPath + "\\voltage.csv";
                string cFile = resultPath + "\\current.csv";
                string pFile = resultPath + "\\power.csv";
                string lFile = resultPath + "\\losses.csv";
                Console.WriteLine("Solution Converged, exporting results to " + vFile + ", " + cFile + ", " + pFile + " and " + lFile);

                DSSText.Command = @"Export Voltage " + vFile;
                DSSText.Command = @"Export Current " + cFile;
                DSSText.Command = @"Export Powers " + pFile;
                DSSText.Command = @"Export Losses " + lFile;

                DSSText.Command = "clear";
                Console.WriteLine("Finished writing result files.");
            }
            else
                Console.WriteLine("Solution did not converge");
        }
    }
}
