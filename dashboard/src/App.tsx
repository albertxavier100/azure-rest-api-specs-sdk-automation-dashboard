import { useState } from 'react';
import './App.css';
import { AgGridReact } from 'ag-grid-react'; // React Data Grid Component
import 'ag-grid-community/styles/ag-grid.css'; // Mandatory CSS required by the Data Grid
import 'ag-grid-community/styles/ag-theme-quartz.css'; // Optional Theme applied to the Data Grid

function App() {
  const grid = prepareGrid();
  const [githubToken, setGithubToken] = useState('');

  return (
    <>
      <input
        type="text"
        value={githubToken}
        onChange={(e) => setGithubToken(e.target.value)}
        placeholder="Enter your Github Token"
      />
      <button onClick={async () => await updateGrid(grid, githubToken)}>Fetch SDK Automation Result</button>

      <div className="ag-theme-quartz" style={{ height: '80vh', width: '95w' }}>
        <AgGridReact rowData={grid.rowData} columnDefs={grid.colDefs} />
      </div>
    </>
  );
}

export default App;

//#region table

// TODO: use enum as keys?
interface RowData {
  ID: string;
  Title: string;
  Language: string;
  'Automation Result': string;
  Pipeline: string;
  Check: string;
  'Breaking Changes': string;
  Time: string;
}

async function updateGrid(grid, githubToken: string) {
  const data = (await fetchSDKAutomationResult(githubToken)) as Array<any>;
  const rows = new Array<RowData>();
  data.forEach((d) => {
    d.checkRuns
      .filter((run) => run.name.startsWith('SDK azure-sdk-for'))
      .forEach((run) => {
        rows.push({
          ID: d.number,
          Title: d.title,
          Language: run.name.substring(18),
          'Automation Result': run.conclusion === 'NEUTRAL' ? 'SKIP' : run.conclusion || 'RUNNING',
          Pipeline: run.detailsUrl,
          Check: run.databaseId,
          'Breaking Changes': run.text?.includes('[Changelog] ### Breaking Changes') === true ? 'YES' : 'NO',
          Time: d.createdAt,
        });
      });
  });
  grid.setRowData(rows);
}

function renderPipelineCell(props) {
  return (
    <a href={props.value} target="_blank" rel="noopener noreferrer">
      {props['column'].colId}
    </a>
  );
}

function renderTitleCell(props) {
  const link = `https://github.com/Azure/azure-rest-api-specs/pull/${props.data.ID}`;
  return (
    <a href={link} target="_blank" rel="noopener noreferrer">
      {props.value}
    </a>
  );
}

function renderCheckCell(props) {
  const link = `https://github.com/Azure/azure-rest-api-specs/pull/${props.data.ID}/checks?check_run_id=${props.value}`;
  return (
    <a href={link} target="_blank" rel="noopener noreferrer">
      {props.value}
    </a>
  );
}

function prepareGrid() {
  // Row Data: The data to be displayed.
  const [rowData, setRowData] = useState<Array<RowData>>([]);
  const columns = [
    {
      field: 'Time',
      cellDataType: 'datestring',
      filter: 'agDateColumnFilter',
    },
    {
      field: 'ID',
      cellDataType: 'number',
      filter: 'agNumberColumnFilter',
    },
    { field: 'Title', cellRenderer: renderTitleCell, filter: 'agTextColumnFilter' },
    {
      field: 'Language',
      filter: 'agTextColumnFilter',
    },
    {
      field: 'Automation Result',
      filter: 'agTextColumnFilter',
      cellStyle: (p) => { 
        if (p.value === "FAILURE")  return {'backgroundColor': '#CC333344'}
        return null
      }
    },
    {
      field: 'Check',
      cellRenderer: renderCheckCell,
     },
    {
      field: 'Pipeline',
      cellRenderer: renderPipelineCell,
    },
    {
      field: 'Breaking Changes',
      filter: 'agTextColumnFilter',
      cellStyle: (p) => { 
        if (p.value === "YES")  return {'backgroundColor': '#2244CC44'}
        return null
      }
    },
  ];

  // Column Definitions: Defines the columns to be displayed.
  const [colDefs, setColDefs] = useState(columns);

  return {
    rowData,
    setRowData,
    colDefs,
    setColDefs,
  };
}
//#endregion

//#region fetch data
const query = `
query ($owner: String!, $repo: String!, $first: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequests(first: $first, orderBy: {field: CREATED_AT, direction: DESC}) {
      nodes {
        number
        title
        createdAt
        commits(last: 1) {
          nodes {
            commit {
              checkSuites(last: 10) {
                nodes {
                  app {
                    name
                  }
                  checkRuns(last: 10) {
                    nodes {
                      title
                      databaseId
                      name
                      conclusion
                      detailsUrl
                      text
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
`;

async function fetchSDKAutomationResult(githubToken: string) {
  const startDate = new Date('2024-01-01T00:00:00Z'); // Start date
  const endDate = new Date('2024-12-31T23:59:59Z'); // End date

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${githubToken}`,
    },
    body: JSON.stringify({
      query: query,
      variables: { owner: 'Azure', repo: 'azure-rest-api-specs', first: 10 },
    }),
  });

  const data = await response.json();
  const filteredPRs = data.data.repository.pullRequests.nodes
    .filter((pr: { createdAt: string | number | Date }) => {
      const createdAt = new Date(pr.createdAt);
      return createdAt >= startDate && createdAt <= endDate;
    })
    .map((pr: { number: any; title: any; createdAt: any; commits: { nodes: any[] } }) => ({
      number: pr.number,
      title: pr.title,
      createdAt: pr.createdAt,
      checkRuns: pr.commits.nodes.flatMap((commit: { commit: { checkSuites: { nodes: any[] } } }) =>
        commit.commit.checkSuites.nodes.flatMap((suite: { checkRuns: { nodes: any } }) => {
          return suite.checkRuns.nodes;
        })
      ),
    }));

  console.log('filteredPRs', filteredPRs);
  return filteredPRs;
}
//#endregion
