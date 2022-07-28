import {BaseAdapterClient, BaseConfig} from '@basuapi/adapter/dist/adapter';
import {BaseAdapter} from '@basuapi/adapter/dist/base-adater';
import { ApplicationDeployAdapterClassHolder } from '@basuapi/api/dist/application-deploy-adapter-class-holder';
import fs from 'fs';
import path from 'path';
import nunjucks from 'nunjucks';

const appName = "adapter-netlify-edge";
class AdapterConfig extends BaseConfig {
  prefix: string 
}

class CustomAdapter extends BaseAdapter<AdapterConfig> {

  //Customizing the template folder
  protected async getTemplate():Promise<string>{
    const templatePath =  `${process.cwd()}/templates/${this.language.toLowerCase()}/handler.njk`;
    if (!fs.existsSync(templatePath)){
        throw new Error(`${templatePath} does not exists. Make sure you choose a valid language.`);
    }
    return fs.readFileSync(templatePath).toString();
  }

  

  //Adding custom dependencies
  protected async generateConfigs(dependencies:any, packageInfo:any, swcConfigJson:any ){
    dependencies.nunjucks = "^3.2.3";

    packageInfo.scripts = {
      ...packageInfo.scripts,
      "create:netlify:folder": "mkdir -p netlify/edge-functions && npx webpack --config webpack.config.js ",
      build: `yarn clean && yarn create:public:folder && swc src -d api && yarn create:netlify:folder`,
      start: 'netlify dev',
      'start:debug': 'netlify dev'
    }

    packageInfo.devDependencies = {
      ...packageInfo.devDependencies,
      "webpack": "^5.74.0",
      "webpack-cli": "^4.10.0"
    }


    return super.generateConfigs(dependencies, packageInfo, swcConfigJson);
  }


  private async getTemplateByName(name:string){
    const templatePath =  `${process.cwd()}/templates/${this.language.toLowerCase()}/${name}.njk`;
    if (!fs.existsSync(templatePath)){
        throw new Error(`${templatePath} does not exists. `);
    }
    return fs.readFileSync(templatePath).toString();

  }

  /**
   * Setting a new port for each class
   * @param content String containing template
   */
    protected async getRenderedTemplate(content:string, item:ApplicationDeployAdapterClassHolder, routeMethod:string, methods:{routePath:string, method: string, item: ApplicationDeployAdapterClassHolder}[]){
        //Adding prefix to methods
        const methodsWithPrefix = methods.map((m:any) => {
          const newItem = {
            ...m,
            item: { ...m.item}
          } 
          newItem.item.route = this.config.prefix + newItem.item.route;
          return newItem;
        })

        return nunjucks.configure({
            autoescape: false
        }).renderString(content,{item, methods: methodsWithPrefix, routeMethod});
    }


    /**
     * Creates the path to a destination file
     * @param currentClass 
     * @returns 
     */
    protected async createDestinationStructure(currentClass: ApplicationDeployAdapterClassHolder): Promise<string>{
        if (!fs.existsSync(path.join(this.destination,'src'))){
            fs.mkdirSync(path.join(this.destination,'src'));            
        }
        const extension = this.language === 'typescript' ? 'ts' : 'js';
        let currentPath = path.join(this.destination,'src').toString();
        
        for (let fn of currentClass.methods){
            const routes = fn.route.split("/");
            let name = routes[routes.length - 1];
            const routePath = path.join(currentPath,name+`.${extension}`);
            currentPath = routePath;
        }


        return currentPath;
    }


   /**
   * Customizing method for files generation.
   * We want to generate a index file containing the logic to start all process.
   */
  protected async generateFiles(classes:ApplicationDeployAdapterClassHolder[]){
    const imports:string[] = []
    const functions:{function:string, path:string}[] = [];
    const webpackConfig:{name:string, value:string}[] = []
    const extension = this.language === 'typescript' ? 'ts' : 'js';
    for (let item of classes){

      const filePath = await this.createDestinationStructure(item);
        //Formatting import
      imports.push("./"+filePath.replace(path.join(this.destination,'src')+"/",''));

      if (!this.replaceFilesInDestination && fs.existsSync(filePath)){
          console.debug("File exists, skipping - " + filePath)
          continue;
      }            

      item.imports.push(`import {${this.routeMethod}} from '@app/${this.routeFile?.replace("dist/","")}'`);

      const methods:any[] = [];
      for (let method of item.methods){
          let routePath = "";
          method.routeSteps.forEach(m => {
              if (routePath != ""){
                  routePath += ""
              }
              routePath += `["${m}"]`
          });
          const fileNamePath = filePath.split('/');
          methods.push({routePath, method: method.method, item:method})
          const functionName = fileNamePath[fileNamePath.length - 1]?.replace(`.${extension}`,'');
          const url = this.config.prefix ? this.config.prefix + method.route : method.route;
          const pathToCompiled = `./api/${functionName}.js` //Extensions is always js because it is a compild file
          webpackConfig.push({name: functionName, value: pathToCompiled})
          functions.push({function: functionName, path: url})
      }

      //compiling template
      const content = await this.getTemplate();
      const template = await this.getRenderedTemplate(content,item,this.routeMethod,methods);

      fs.writeFileSync(filePath, template);
    }

    await this.generateNetlifyConfigurationFile(functions);
    await this.generateWebpackConfig(webpackConfig);
    await this.generateFunctionsDefault(webpackConfig);
  }


  private async generateNetlifyConfigurationFile(functions: {function: string, path:string}[]){
    const templateContent = await this.getTemplateByName('netlify');
    const content = nunjucks.configure({
      autoescape: false
      }).renderString(templateContent,{functions});
    fs.writeFileSync(path.join(this.destination,'netlify.toml'),content);
  }

  private async generateWebpackConfig(config:{name:string, value:string}[]){
    const templateContent = await this.getTemplateByName('webpack');
    const content = nunjucks.configure({
      autoescape: false
      }).renderString(templateContent,{items: config});
    fs.writeFileSync(path.join(this.destination,'webpack.config.js'),content);
  }

  private async generateFunctionsDefault(items:{name:string, value:string}[]){    
    const templateContent = await this.getTemplateByName('netlify_default');
    const outputFolder = path.join(this.destination,'netlify','edge-functions');
    if (!fs.existsSync(outputFolder)){
      fs.mkdirSync(outputFolder, { recursive: true });
    }
    for (let item of items){
      const content = nunjucks.configure({
        autoescape: false
        }).renderString(templateContent,{name: item.name});
        fs.writeFileSync(path.join(outputFolder,item.name+'.js'),content);
    }
  }

  async init() : Promise<void>{
    await super.init();
    const buildCommand = `cd ${this.destination} && yarn build `;
    setTimeout(() => { //BS code, must be changed on runCommand to wait for it to finish
      this.runCommand(buildCommand);
      console.log(`Everything is done. Run yarn adapter:${appName}:start`)
    },3000)
    
  }

}


export class TemplateAdapter extends BaseAdapterClient<AdapterConfig>{
  constructor(){
    super(appName,"A basu adapter for netlify edge functions","1.0.0",require('../package.json').name)
  }

  protected async startAdapter(config:AdapterConfig) : Promise<void> {

    config.prefix = this.getConfig().prefix;
    if (!config.prefix){
      config.prefix = '';
    }

    const customAdapter = new CustomAdapter(config);
    await customAdapter.init();
  }

  protected addExtraDataToPackageInfo(packageInfo:any,_route:string, options:{folder:string, mergedeps:string, language:string, applicationfolder:string}){
    this.addToSection(packageInfo.scripts,`adapter:${this.name}:start`,`cd ${options.folder} && yarn build && yarn start`);
    this.addToSection(packageInfo.scripts,`adapter:${this.name}:start:debug`,`cd ${options.folder} && yarn build && yarn start:debug`);
  }


}



new TemplateAdapter().execute();