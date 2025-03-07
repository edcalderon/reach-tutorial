import { loadStdlib, test } from '@reach-sh/stdlib';
import * as backend from './build/index.main.mjs';

// Basics
const stdlib = loadStdlib();
const err = {
  'ETH': 'transaction may fail',
  'ALGO': 'assert failed',
  'CFX': 'transaction is reverted',
}[stdlib.connector];

// Framework
const makeRSVP = async ({ hostLabel, name, reservation, timeLimit }) => {
  const sbal = stdlib.parseCurrency(100);
  const accHost = await stdlib.newTestAccount(sbal);
  accHost.setDebugLabel(hostLabel);

  const stdPerson = (obj) => {
    const { acc } = obj;
    const getBalance = async () => {
      const bal = await acc.balanceOf();
      return `${stdlib.formatCurrency(bal, 4)} ${stdlib.standardUnit}`;
    };
    return {
      ...obj,
      getBalance,
    };
  };

  const Host = stdPerson({
    acc: accHost,
    label: hostLabel,
  });

  const deadline = (await stdlib.getNetworkTime()).add(timeLimit);
  const waitUntilDeadline = async () => {
    console.log(`Waiting until ${deadline}`);
    await stdlib.waitUntilTime(deadline);
  };

  const details = {
    name, reservation, deadline, host: accHost,
  };

  const makeGuest = async (label) => {
    const acc = await stdlib.newTestAccount(sbal);
    acc.setDebugLabel(label);

    let ctcInfo = undefined;
    const willGo = async () => {
      const ctcGuest = acc.contract(backend);
      ctcInfo = await stdlib.withDisconnect(() => ctcGuest.p.Guest({
        details,
        registered: stdlib.disconnect,
      }));
      console.log(`${label} made reservation: ${ctcInfo}`);
    };
    const doHost = async (showed) => {
      if ( ctcInfo === undefined ) {
        throw new Error('no reservation');
      }
      console.log(`Checking in ${label} to ${ctcInfo}...`);
      const ctcHost = accHost.contract(backend, ctcInfo);
      await ctcHost.p.Host({
        details, showed
      });
      console.log(`${label} did${showed ? '' : ' not'} show.`);
    };
    const showUp = () => doHost(true);
    const noShow = () => doHost(false);

    return stdPerson({
      acc, label,
      willGo, showUp, noShow,
    });
  };
  const makeGuests = (labels) => Promise.all(labels.map(makeGuest));

  return { Host, makeGuest, makeGuests, waitUntilDeadline };
};

// Test Scenarios
test.one('BBBB', async () => {
  const Event = await makeRSVP({
    hostLabel: 'Buffy',
    name: `Buffy's Birthday Bash at the Bronze`,
    reservation: stdlib.parseCurrency(1),
    timeLimit: 250,
  });
  const Buffy = Event.Host;
  const People = await Event.makeGuests([
    'Xander', 'Willow', 'Cordelia', 'Giles', 'Oz', 'Angel', 'Jonathan',
  ]);
  const [ Xander, Willow, Cordelia, Giles, Oz, Angel, Jonathan ] = People;
  const Scoobies = [ Xander, Willow, Cordelia, Giles, Oz ];
  await Promise.all( Scoobies.map((G) => G.willGo()) );
  await Event.waitUntilDeadline();
  await test.chkErr('Angel', err, async () => {
    await Angel.willGo();
  });
  await Xander.showUp();
  await Willow.showUp();
  await Cordelia.showUp();
  await test.chkErr('Jonathan', 'no reservation', async () => {
    await Jonathan.showUp();
  });
  await Giles.noShow();
  await Oz.noShow();

  for ( const p of [ Buffy, ...People ] ) {
    const bal = await p.getBalance();
    console.log(`${p.label} has ${bal}`);
  }
});

await test.run({ noVarOutput: true });