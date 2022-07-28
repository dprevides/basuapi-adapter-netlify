# @basuapi/adapter-netlify-edge
This is an adapter for netlify edge functions.
use:
To install the adapter into your current project
npx @basuapi/adapter-netlify-edge install <ROUTE_FILE>.<ROUTE_METHOD>
ROUTE_FILE is a path to a file containing the route.
ROUTE_METHOD is the method inside the <ROUTE_FILE> exporting the routes.
Eg: 
For a file named myroutes.ts with the content:
export const routes = {  
    '/public': {
        "/hello": {
            get: async ({}:{}) => {
                return {
                    status: 200,
                    data: "Hello World"
                }            
            }
        },
    }
}

the command would be:
npx @basuapi/adapter-netlify-edge install dist/myroutes.routes

The above command uses dist/myroutes because the javascript version of this file is in dist folder.
