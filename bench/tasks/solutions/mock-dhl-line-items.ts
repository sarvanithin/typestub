const os = (await messyMock.listOrdersAll({ status: 'shipped' })).filter((o) => o.shipping?.carrier === 'dhl');
submit(Math.round((os.reduce((s, o) => s + o.line_items.length, 0) / os.length) * 100) / 100);
