export const routes = {
    '/public/auth': {
        "/login": {
            post: async ({body}:{body:any}) => {
                return {
                    status: 200,
                    data: {}
                }
            }
                
        },
        "/register": {
            post: async ({body}:{body:any}) => {
                return {
                    status: 201,
                    data: {}
                }                
            } 
        }    
    },
    '/private': {
        "/hello": {
            get: async ({}:{}) => {
                return {
                    status: 200,
                    data: "Hello World"
                }            
            }
        },
        '/users': {
            get: async ({response, query}: {response:any, query:{filter:any, page: any}}) => 
            {
                return {
                    status: 200,
                    data: [{id: 1}, {id: 2}]
                }  
            }
        }
    }
}


