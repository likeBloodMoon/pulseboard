@{
    RootModule        = 'src/Pulseboard.Agent.psm1'
    ModuleVersion     = '0.1.0'
    GUID              = 'c9e7e40d-08b9-4d2b-a26e-bb8fa3a1a6c4'
    Author            = 'Pulseboard'
    CompanyName       = 'Pulseboard'
    Copyright         = '(c) Pulseboard'
    Description       = 'Device-side PowerShell agent for Pulseboard heartbeats, metrics, and diagnostics.'
    PowerShellVersion = '7.0'
    FunctionsToExport = '*'
    CmdletsToExport   = @()
    AliasesToExport   = @()
    PrivateData       = @{
        PSData = @{
            Tags = @('pulseboard','agent','monitoring')
        }
    }
}
