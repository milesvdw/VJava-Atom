export class VJavaParser
{
	parseVJava(onData, textContents)
	{
		// var packagePath = atom.packages.resolvePackagePath("variational-java") + "/lib";
    // exec('cd ' + packagePath);

    var spawn = require('child_process').spawn;
    var parser = spawn('variational-parser',[],{ cwd: packagePath });
    parser.stdout.setEncoding('utf8');
    parser.stdout.on('data', function (data) {
      //vjava.originalDoc = JSON.parse(data.toString());
			onData(JSON.parse(data.toString()));
    });

    parser.stdin.write(textContents);
    parser.stdin.end();
	}
}
