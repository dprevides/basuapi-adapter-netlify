import {BaseAdapterClient, BaseConfig} from '@basuapi/adapter/dist/adapter';
import {BaseAdapter} from '@basuapi/adapter/dist/base-adater';
import { ApplicationDeployAdapterClassHolder } from '@basuapi/api/dist/application-deploy-adapter-class-holder';
import fs from 'fs';
import path from 'path';
import nunjucks from 'nunjucks';

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
      "create:netlify:folder": "mkdir -p netlify/edge-functions && cp -fr api/* netlify/edge-functions",
      build: `yarn clean && yarn create:public:folder && swc src -d api && yarn create:netlify:folder`

    }


    return super.generateConfigs(dependencies, packageInfo, swcConfigJson);
  }



  private async getTemplateForNetlifyConfigToml(){
    const templatePath =  `${process.cwd()}/templates/${this.language.toLowerCase()}/netlify.njk`;
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
          functions.push({function: fileNamePath[fileNamePath.length - 1]?.replace(`.${extension}`,''), path: this.config.prefix ? this.config.prefix + method.route : method.route})
      }

      //compiling template
      const content = await this.getTemplate();
      const template = await this.getRenderedTemplate(content,item,this.routeMethod,methods);

      fs.writeFileSync(filePath, template);
    }

    this.generateNetlifyConfigurationFile(functions);
  }


  private async generateNetlifyConfigurationFile(functions: {function: string, path:string}[]){
    const templateContent = await this.getTemplateForNetlifyConfigToml();
    const content = nunjucks.configure({
      autoescape: false
      }).renderString(templateContent,{functions});
    fs.writeFileSync(path.join(this.destination,'netlify.toml'),content);
  }

}


export class TemplateAdapter extends BaseAdapterClient<AdapterConfig>{
  constructor(){
    super("adapter-netlify-edge","A basu adapter for netlify edge functions","1.0.0",require('../package.json').name)
  }

  protected async startAdapter(config:AdapterConfig) : Promise<void> {

    config.prefix = this.getConfig().prefix;
    if (!config.prefix){
      config.prefix = '';
    }

    const customAdapter = new CustomAdapter(config);
    await customAdapter.init();
  }


}



new TemplateAdapter().execute();